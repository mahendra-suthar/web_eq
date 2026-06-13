import logging
from io import BytesIO
from sqlalchemy.orm import Session
from fastapi import HTTPException
from uuid import UUID
from typing import List, Literal, Optional, Any, Dict, Tuple
from datetime import date, datetime, time, timedelta, timezone
import pytz

from app.core.constants import (
    TIMEZONE,
    BUSINESS_REGISTERED,
    QUEUE_RUNNING, QUEUE_STOPPED,
    QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS, QUEUE_USER_COMPLETED,
    QUEUE_USER_FAILED, QUEUE_USER_CANCELLED, QUEUE_USER_SCHEDULED,
    QUEUE_USER_PRIORITY_REQUESTED, QUEUE_USER_EXPIRED,
    QUEUE_USER_STATUS_LABELS,
    TIME_FORMAT, DEFAULT_AVG_TIME,
    BOOKING_MODE_FIXED, BOOKING_MODE_APPROXIMATE, BOOKING_MODE_HYBRID,
    APPOINTMENT_TYPE_QUEUE, APPOINTMENT_TYPE_FIXED, APPOINTMENT_TYPE_APPROXIMATE,
)
from app.core.utils import (
    APP_TZ,
    build_live_queue_users_raw,
    today_app_date,
    current_time_app_tz,
    now_app_tz,
    format_date_iso,
    appointment_time_to_enqueue_dequeue,
    appointment_window,
    windows_overlap,
)
from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.booking_calculation_service import BookingCalculationService
from app.services.slot_generation_service import SlotGenerationService
from app.services.export_service import MAX_EXPORT_ROWS, build_xlsx, build_pdf
from app.services.user_service import UserService
from app.services.employee_service import EmployeeService
from app.services.notification_triggers import (
    notify_booking_confirmed,
    notify_new_customer,
    notify_in_service,
    notify_called_next,
    notify_service_completed,
    notify_no_show,
    notify_skipped,
    notify_heading_now_sync,
)
from app.services.realtime.queue_manager import queue_manager
from app.services.realtime.live_queue_manager import live_queue_manager, calculate_queue_waits
from app.services.realtime.customer_queue_manager import customer_queue_manager
from app.schemas.queue import (
    QueueCreate, QueueCreateBatch, QueueData, QueueDetailData, QueueServiceDetailData,
    QueueUpdate, QueueServicesAdd, QueueServiceUpdate,
    QueueUserData, QueueUserDetailResponse, QueueUsersPageResponse,
    AvailableSlotData, BookingCreateInput, BookingData, BookingServiceData, BookingPreviewData,
    LiveQueueData,
    CustomerTodayAppointmentResponse,
    CustomerTodayAppointmentsResponse,
    SlotsListResponse,
    SlotData,
    NextCustomerResponse,
)
from app.schemas.user import UserData
from app.schemas.service import ServiceData


logger = logging.getLogger(__name__)


class QueueController:
    def __init__(self, db: Session):
        self.db = db
        self.queue_service = QueueService(db)
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)

    async def create_queue(self, data: QueueCreate) -> QueueData:
        try:
            service_ids = [s.service_id for s in data.services]
            services = self.queue_service.get_services_by_ids(service_ids) if service_ids else []
            if service_ids and len(services) != len(service_ids):
                raise HTTPException(400, "One or more services not found")

            queue = self.queue_service.create_queue(data=data, services=services)
            self.business_service.update_registration_state(
                business_id=data.business_id, status=BUSINESS_REGISTERED, current_step=None
            )
            return QueueData.from_queue(queue)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to create_queue (business_id=%s)", data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def create_queues_batch(self, data: QueueCreateBatch) -> List[QueueData]:
        if not data.queues:
            raise HTTPException(400, "At least one queue is required")
        try:
            queues = self.queue_service.create_queues_batch(data.business_id, data.queues)
            self.business_service.update_registration_state(
                business_id=data.business_id, status=BUSINESS_REGISTERED, current_step=None
            )
            return [QueueData.from_queue(q) for q in queues]
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(400, {"message": str(e)})
        except Exception:
            logger.exception("Failed to create_queues_batch (business_id=%s)", data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_queues(self, business_id: UUID) -> List[QueueData]:
        try:
            queues = self.queue_service.get_queues(business_id)
            return [QueueData.from_queue(queue) for queue in queues]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_queues (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_queue_detail(self, queue_id: UUID) -> QueueDetailData:
        try:
            queue = self.queue_service.get_queue_by_id_with_employees(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            rows = self.queue_service.get_queue_services_with_service(queue_id)
            services = [
                QueueServiceDetailData.from_queue_service_and_service(qs, svc)
                for qs, svc in rows
            ]
            return QueueDetailData.from_queue_and_services(queue, services)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_queue_detail (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_queue(self, queue_id: UUID, business_id: UUID, data: QueueUpdate) -> QueueData:
        try:
            queue = self.queue_service.update_queue(queue_id, business_id, data)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            return QueueData.from_queue(queue)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to update_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def add_services_to_queue(
        self, queue_id: UUID, business_id: UUID, data: QueueServicesAdd
    ) -> List[QueueServiceDetailData]:
        try:
            created = self.queue_service.add_services_to_queue(queue_id, business_id, data.services)
            if not created:
                return []
            service_ids = [qs.service_id for qs in created]
            services_list = self.queue_service.get_services_by_ids(service_ids)
            services_by_id = {s.uuid: s for s in services_list}
            return [
                QueueServiceDetailData.from_queue_service(
                    qs,
                    service_name=getattr(services_by_id.get(qs.service_id), "name", None),
                )
                for qs in created
            ]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to add_services_to_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_queue_service(
        self, queue_service_id: UUID, data: QueueServiceUpdate
    ) -> QueueServiceDetailData:
        try:
            qs = self.queue_service.update_queue_service(queue_service_id, data)
            if not qs:
                raise HTTPException(status_code=404, detail="Queue service not found")
            services_list = self.queue_service.get_services_by_ids([qs.service_id])
            svc = services_list[0] if services_list else None
            return QueueServiceDetailData.from_queue_service_and_service(qs, svc)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to update_queue_service (queue_service_id=%s)", queue_service_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def delete_queue_service(self, queue_service_id: UUID) -> None:
        try:
            ok = self.queue_service.delete_queue_service(queue_service_id)
            if not ok:
                raise HTTPException(status_code=404, detail="Queue service not found")
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to delete_queue_service (queue_service_id=%s)", queue_service_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def delete_queue(self, queue_id: UUID, business_id: UUID) -> None:
        try:
            ok = self.queue_service.delete_queue(queue_id, business_id)
            if not ok:
                raise HTTPException(status_code=404, detail={"message": "Queue not found"})
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to delete_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_queue_user_detail(self, queue_user_id: UUID) -> QueueUserDetailResponse:
        try:
            queue_user = self.queue_service.get_queue_user_by_id_with_relations(queue_user_id)
            if not queue_user:
                raise HTTPException(status_code=404, detail="Queue user not found")
            if not queue_user.user or not queue_user.queue:
                raise HTTPException(status_code=404, detail="Queue user data incomplete")
            return QueueUserDetailResponse.from_queue_user(queue_user)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_queue_user_detail (queue_user_id=%s)", queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_business_services(self, business_id: UUID) -> List[ServiceData]:
        try:
            services = self.queue_service.get_business_services(business_id)
            return [
                ServiceData.from_queue_service_and_service(queue_service, service)
                for queue_service, service in services
            ]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_services (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_users(
        self,
        *,
        business_id: UUID | None,
        queue_id: UUID | None,
        employee_id: UUID | None,
        page: int,
        limit: int,
        search: str | None,
        status: int | None,
    ) -> QueueUsersPageResponse:
        try:
            rows, total, pages = self.queue_service.get_queue_users(
                business_id=business_id,
                queue_id=queue_id,
                employee_id=employee_id,
                page=page,
                limit=limit,
                search=search,
                status=status,
            )
            return QueueUsersPageResponse(
                items=[QueueUserData.from_row(queue_user, user) for queue_user, user in rows],
                total=total,
                page=page,
                pages=pages,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_users (business_id=%s queue_id=%s)", business_id, queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def export_queue_users(
        self,
        *,
        fmt: Literal["pdf", "xlsx"],
        business_id: UUID | None,
        queue_id: UUID | None,
        employee_id: UUID | None,
        search: str | None,
    ) -> tuple[BytesIO, str, str]:
        try:
            rows_raw, _, _ = self.queue_service.get_queue_users(
                business_id=business_id,
                queue_id=queue_id,
                employee_id=employee_id,
                page=1,
                limit=MAX_EXPORT_ROWS,
                search=search,
                status=None,
            )
            columns = ["Name", "Email", "Phone", "Token No.", "Queue Date", "Enqueue Time", "Status", "Priority"]
            rows = [
                [
                    getattr(user, "full_name", "") or "",
                    getattr(user, "email", "") or "",
                    f"{getattr(user, 'country_code', '') or ''} {getattr(user, 'phone_number', '') or ''}".strip(),
                    queue_user.token_number or "",
                    queue_user.queue_date.strftime("%Y-%m-%d") if queue_user.queue_date else "",
                    queue_user.enqueue_time,
                    QUEUE_USER_STATUS_LABELS.get(queue_user.status, "Unknown"),
                    "Yes" if getattr(queue_user, "priority", False) else "No",
                ]
                for queue_user, user in rows_raw
            ]
            today = date.today().strftime("%Y-%m-%d")
            filename = f"queue-users-{today}.{fmt}"
            if fmt == "xlsx":
                buf = build_xlsx(columns, rows)
                media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                buf = build_pdf("Queue Users Report", columns, rows)
                media_type = "application/pdf"
            return buf, media_type, filename
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to export_queue_users (business_id=%s queue_id=%s)", business_id, queue_id)
            raise HTTPException(status_code=500, detail={"message": "Export failed. Please try again."})

    # ─────────────────────────────────────────────────────────────────────────
    # Customer Booking APIs
    # ─────────────────────────────────────────────────────────────────────────

    def _build_queue_preview_metrics(
        self,
        queues: List[Any],
        booking_date: date,
        current_time: datetime,
        raw_rows: List[dict],
        services_by_queue: Optional[Dict] = None,
        exclude_user_id: Optional[UUID] = None,
    ) -> Dict[UUID, Dict[str, Any]]:
        """
        Compute per-queue position/wait metrics for a prospective new booking using
        calculate_queue_waits() — the same authoritative cursor algorithm as the live queue.
        SCHEDULED (status=8) users are treated as time-reservations, not active waiting
        users, so they only affect timing (pushing the new user's slot later) without
        incorrectly inflating position or wait for an empty queue.
        """
        from app.services.realtime.live_queue_manager import calculate_queue_waits, _scheduled_start_dt

        calc = BookingCalculationService(self.db)
        now = current_time
        now_ms = int(now.timestamp() * 1000)
        result: Dict[UUID, Dict[str, Any]] = {}

        for queue in queues:
            qid = queue.uuid
            queue_rows = [
                r for r in raw_rows
                if r["queue_id"] == qid
                and (exclude_user_id is None or r.get("user_id") != exclude_user_id)
            ]

            # New user's total service duration for this queue
            new_user_turn: float = 15.0
            if services_by_queue:
                svcs = services_by_queue.get(qid, [])
                if svcs:
                    new_user_turn = float(sum(s.get("duration") or 0 for s in svcs) or 15.0)

            # Get open_dt + breaks for the queue's operating hours
            open_dt = None
            breaks: list = []
            try:
                open_time, _, breaks, _ = calc.get_employee_window(queue, booking_date)
                open_dt = APP_TZ.localize(datetime.combine(booking_date, open_time))
            except Exception:
                pass

            # Run the authoritative cursor algorithm on existing users
            waits = calculate_queue_waits(queue_rows, now=now, open_dt=open_dt, breaks=breaks)
            ordered = waits["ordered_waiting"]
            wait_data = waits["wait_data"]

            # Derive cursor after all currently ordered users finish
            if ordered:
                last_uid = str(ordered[-1]["uuid"])
                last_wd = wait_data.get(last_uid, {})
                cursor_end_ms = last_wd.get("expected_end_ts") or now_ms
                cursor_after = datetime.fromtimestamp(cursor_end_ms / 1000, tz=APP_TZ)
            else:
                # No ordered users — check if an in-progress user is still running
                in_prog_ms = None
                for row in queue_rows:
                    if row.get("status") == QUEUE_USER_IN_PROGRESS:
                        wd = wait_data.get(str(row["uuid"]), {})
                        in_prog_ms = wd.get("expected_end_ts") or wd.get("expected_at_ts")
                        break
                if in_prog_ms:
                    cursor_after = datetime.fromtimestamp(in_prog_ms / 1000, tz=APP_TZ)
                else:
                    cursor_after = max(now, open_dt) if open_dt else now

            # Build SCHEDULED blocks for conflict simulation
            sched_blocks = []
            for row in queue_rows:
                if row.get("status") == QUEUE_USER_SCHEDULED:
                    s_dt = _scheduled_start_dt(row, booking_date)
                    if s_dt is not None:
                        sched_blocks.append((s_dt, float(row.get("turn_time") or 15.0)))
            sched_blocks.sort(key=lambda x: x[0])

            # Simulate new walk-in placement after all current ordered users
            new_start = cursor_after
            for s_dt, s_turn in sched_blocks:
                s_end = s_dt + timedelta(minutes=s_turn)
                if s_end <= new_start:
                    continue
                if s_dt < new_start + timedelta(minutes=new_user_turn):
                    new_start = max(new_start, s_end)

            new_wait_minutes = max(0, int((new_start - now).total_seconds() / 60))

            # SCHEDULED blocks served before the new user contribute to displayed position
            sched_ahead = sum(1 for s_dt, _ in sched_blocks if now < s_dt <= new_start)

            # in_progress already folded into new_wait_minutes via the cursor; pass 0
            result[qid] = {
                "registered_count": len(ordered) + sched_ahead,
                "in_progress_count": 0,
                "total_wait_minutes": new_wait_minutes,
            }

        return result

    def _build_services_by_queue(self, raw_details: List[dict]) -> Dict[UUID, List[dict]]:
        """Group flat queue service details by queue_id."""
        result: Dict[UUID, List[dict]] = {}
        for d in raw_details:
            qid = d["queue_id"]
            if qid not in result:
                result[qid] = []
            result[qid].append({
                "queue_service_uuid": d["queue_service_uuid"],
                "service_uuid": d["service_uuid"],
                "service_name": d["service_name"],
                "price": d["price"],
                "duration": d["duration"],
            })
        return result

    def _find_booking_time_conflict(
        self,
        user_id: UUID,
        queue_date: date,
        new_window: Optional[tuple],
        calc_service: BookingCalculationService,
    ) -> Optional[tuple]:
        """Return the first (queue_user, queue, business) whose CURRENT time window
        overlaps new_window on the same date, or None. Uses fresh metrics (not stale
        stored times) so it reflects how the queues actually stand right now."""
        if new_window is None:
            return None
        for qu, queue, business in self.queue_service.get_user_upcoming_active_appointments(user_id):
            if qu.queue_date != queue_date:
                continue
            appt_time = calc_service.get_existing_queue_user_metrics(qu).get("appointment_time")
            sched = qu.scheduled_start.strftime("%H:%M") if getattr(qu, "scheduled_start", None) else None
            existing_window = appointment_window(
                getattr(qu, "appointment_type", None),
                appt_time,
                sched,
                getattr(qu, "turn_time", None),
                queue_date,
            )
            if windows_overlap(new_window, existing_window):
                return (qu, queue, business)
        return None

    def _raise_time_conflict(self, conflict: tuple, calc_service: BookingCalculationService) -> None:
        """Raise a structured 409 describing the clashing appointment."""
        cqu, cqueue, cbiz = conflict
        ctime = calc_service.get_existing_queue_user_metrics(cqu).get("appointment_time") or ""
        biz_name = cbiz.name if cbiz else ""
        around = f" around {ctime}" if ctime else ""
        raise HTTPException(status_code=409, detail={
            "message": f"This overlaps your {biz_name} booking{around}. Please pick another time.",
            "conflict": {
                "business_name": biz_name,
                "queue_name": cqueue.name if cqueue else "",
                "time": ctime,
                "queue_user_id": str(cqu.uuid),
            },
        })

    async def get_booking_preview(
        self,
        business_id: UUID,
        booking_date: date,
        service_ids: List[UUID],
        user_id: Optional[UUID] = None,
    ) -> BookingPreviewData:
        try:
            calc_service = BookingCalculationService(self.db)
            business = self.business_service.get_business_by_id(business_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")

            queues = self.queue_service.get_queues_offering_service_ids(business_id, service_ids)
            if not queues:
                return BookingPreviewData(
                    business_id=str(business_id),
                    date=booking_date.isoformat(),
                    queues=[],
                    recommended_queue_id=None,
                )

            queue_ids = [q.uuid for q in queues]
            today = today_app_date()
            ist = pytz.timezone(TIMEZONE)
            current_time = datetime.now(ist)

            raw_users = self.queue_service.get_today_active_queue_user_rows(queue_ids, booking_date)
            raw_services = self.queue_service.get_queue_service_details_for_ids(service_ids)
            services_by_queue = self._build_services_by_queue(raw_services)
            today_metrics = (
                self._build_queue_preview_metrics(
                    queues, booking_date, current_time, raw_users, services_by_queue,
                    exclude_user_id=user_id,
                )
                if booking_date == today else {}
            )

            # Queues the user is already booked in (so the UI shows "You're already here"
            # with the real position + expected time, and a link to that appointment).
            already_booked: Dict[UUID, Dict[str, Any]] = {}
            if user_id is not None:
                queue_id_set = set(queue_ids)
                for qu, _q, _b in self.queue_service.get_user_upcoming_active_appointments(user_id):
                    if qu.queue_date == booking_date and qu.queue_id in queue_id_set:
                        m = calc_service.get_existing_queue_user_metrics(qu)
                        already_booked[qu.queue_id] = {
                            "position": m.get("position"),
                            "appointment_time": m.get("appointment_time"),
                        }

            preview = calc_service.calculate_booking_preview(
                business_id, booking_date, service_ids,
                today_metrics=today_metrics,
                services_by_queue=services_by_queue,
                already_booked=already_booked,
            )
            return BookingPreviewData(**preview)

        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_booking_preview (business_id=%s date=%s)", business_id, booking_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_available_slots(
        self,
        business_id: UUID,
        booking_date: date,
        service_ids: Optional[List[UUID]] = None
    ) -> List[AvailableSlotData]:
        try:
            await queue_manager.connect_to_redis()

            date_str = booking_date.strftime("%Y-%m-%d")
            service_id_strs = [str(sid) for sid in service_ids] if service_ids else None

            slots = await queue_manager.get_available_slots(
                db=self.db,
                business_id=str(business_id),
                date_str=date_str,
                service_ids=service_id_strs
            )
            return [AvailableSlotData(**slot) for slot in slots]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_available_slots (business_id=%s date=%s)", business_id, booking_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def create_booking(
        self,
        user_id: UUID,
        data: BookingCreateInput
    ) -> BookingData:
        try:
            await queue_manager.connect_to_redis()

            calc_service = BookingCalculationService(self.db)

            # Walk-in: staff is adding a customer manually — resolve or create guest user
            is_walk_in = bool(data.recipient_phone and data.recipient_country_code)
            if is_walk_in:
                user_service = UserService(self.db)
                guest = user_service.find_or_create_guest_user(
                    phone_number=data.recipient_phone,
                    country_code=data.recipient_country_code,
                    full_name=data.recipient_name,
                )
                booking_user_id = guest.uuid
            else:
                booking_user_id = user_id

            business = self.business_service.get_business_by_id(data.business_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")

            all_queue_services = self.queue_service.get_queue_services_for_booking(
                data.service_ids, data.business_id
            )
            if not all_queue_services:
                raise HTTPException(status_code=400, detail="No valid services selected")

            if data.queue_id:
                queue = self.queue_service.get_queue_by_id_and_business(
                    data.queue_id, data.business_id
                )
                if not queue:
                    raise HTTPException(status_code=404, detail="Queue not found")
                queue_id = data.queue_id
                queue_services = [qs for qs in all_queue_services if qs.queue_id == queue_id]
                if not queue_services:
                    queue_services = all_queue_services

                if data.queue_date == today_app_date():
                    ist = pytz.timezone(TIMEZONE)
                    current_time = datetime.now(ist)
                    raw_users = self.queue_service.get_today_active_queue_user_rows(
                        [queue_id], data.queue_date
                    )
                    services_by_queue_single = self._build_services_by_queue(
                        self.queue_service.get_queue_service_details_for_ids(data.service_ids)
                    )
                    today_metrics_single = self._build_queue_preview_metrics(
                        [queue], data.queue_date, current_time, raw_users, services_by_queue_single
                    )
                    metrics = calc_service.calculate_today_queue_metrics(
                        queue_id, data.queue_date, data.service_ids,
                        today_metrics=today_metrics_single,
                    )
                else:
                    metrics = calc_service.calculate_future_queue_metrics(
                        queue_id, data.queue_date, data.service_ids
                    )
            else:
                today_metrics = None
                services_by_queue = None
                if data.queue_date == today_app_date():
                    queues_for_optimal = self.queue_service.get_queues_offering_service_ids(
                        data.business_id, data.service_ids
                    )
                    qids = [q.uuid for q in queues_for_optimal] if queues_for_optimal else []
                    ist = pytz.timezone(TIMEZONE)
                    current_time = datetime.now(ist)
                    raw_users = self.queue_service.get_today_active_queue_user_rows(
                        qids, data.queue_date
                    ) if qids else []
                    raw_services = self.queue_service.get_queue_service_details_for_ids(
                        data.service_ids
                    )
                    services_by_queue = self._build_services_by_queue(raw_services)
                    today_metrics = (
                        self._build_queue_preview_metrics(
                            queues_for_optimal, data.queue_date, current_time, raw_users, services_by_queue
                        )
                        if qids else {}
                    )
                optimal_queue = calc_service.find_optimal_queue(
                    data.business_id, data.queue_date, data.service_ids,
                    today_metrics=today_metrics,
                    services_by_queue=services_by_queue,
                )
                if not optimal_queue:
                    raise HTTPException(status_code=404, detail="No available queues for selected services")

                queue_id = UUID(optimal_queue["queue_id"])
                metrics = {
                    "position": optimal_queue["position"],
                    "wait_minutes": optimal_queue["estimated_wait_minutes"],
                    "wait_range": optimal_queue["estimated_wait_range"],
                    "appointment_time": optimal_queue["estimated_appointment_time"]
                }

                queue = self.queue_service.get_queue_by_id(queue_id)
                if not queue:
                    raise HTTPException(status_code=404, detail="Selected queue not found")

                queue_services = [qs for qs in all_queue_services if qs.queue_id == queue_id]
                if not queue_services:
                    queue_services = all_queue_services

            if is_walk_in and data.queue_date == today_app_date():
                # Walk-in: block duplicate — admin must not add someone already in the queue today
                duplicate = self.queue_service.get_existing_same_day_booking(
                    booking_user_id, queue_id, data.queue_date
                )
                if duplicate is not None:
                    raise HTTPException(
                        status_code=409,
                        detail="This customer already has an active appointment in this queue today.",
                    )
            elif not is_walk_in:
                # Self-booking: return existing slot for today OR future dates — prevents duplicate slots
                existing_booking = self.get_existing_booking(
                    user_id=booking_user_id,
                    queue_id=queue_id,
                    queue_date=data.queue_date,
                    business_id=data.business_id,
                    queue=queue,
                    business=business,
                    calc_service=calc_service,
                )
                if existing_booking is not None:
                    return existing_booking

            slot_id = getattr(data, "slot_id", None)
            appointment_type = (data.appointment_type or "QUEUE").upper()
            scheduled_start = None
            scheduled_end = None

            if appointment_type == "QUEUE" and metrics.get("appointment_time") and not is_walk_in:
                preliminary_service_time = sum((qs.avg_service_time or 5) for qs in queue_services)
                new_window = appointment_window(
                    "QUEUE", metrics["appointment_time"], None, preliminary_service_time, data.queue_date
                )
                conflict = self._find_booking_time_conflict(
                    booking_user_id, data.queue_date, new_window, calc_service
                )
                if conflict:
                    self._raise_time_conflict(conflict, calc_service)

            if appointment_type in ("FIXED", "APPROXIMATE") and slot_id:
                slot = self.queue_service.get_slot_by_id(slot_id)
                if not slot:
                    raise HTTPException(status_code=404, detail="Slot not found")
                if str(slot.queue_id) != str(queue_id) or slot.slot_date != data.queue_date:
                    raise HTTPException(status_code=400, detail="Slot does not match selected queue or date")
                if slot.is_blocked:
                    raise HTTPException(status_code=409, detail="Slot is not available")
                if not is_walk_in:
                    slot_service_time = sum((qs.avg_service_time or 5) for qs in queue_services)
                    new_window = appointment_window(
                        "FIXED",
                        None,
                        slot.slot_start.strftime("%H:%M") if slot.slot_start else None,
                        slot_service_time,
                        data.queue_date,
                    )
                    conflict = self._find_booking_time_conflict(
                        booking_user_id, data.queue_date, new_window, calc_service
                    )
                    if conflict:
                        self._raise_time_conflict(conflict, calc_service)
                reserved = self.queue_service.reserve_slot_atomic(slot_id)
                if not reserved:
                    raise HTTPException(status_code=409, detail="Slot is full")
                scheduled_start = slot.slot_start
                scheduled_end = slot.slot_end
                metrics = {
                    "position": 1,
                    "wait_minutes": 0,
                    "wait_range": "",
                    "appointment_time": slot.slot_start.strftime(TIME_FORMAT) if slot.slot_start else "",
                }

            total_service_time = sum((qs.avg_service_time or 5) for qs in queue_services)
            date_str = format_date_iso(data.queue_date)
            token_number = await queue_manager.generate_token_number(str(queue_id), date_str)
            estimated_enqueue_dt, estimated_dequeue_dt = appointment_time_to_enqueue_dequeue(
                metrics.get("appointment_time"),
                data.queue_date,
                total_service_time,
            )

            eta_val = getattr(data, "eta_minutes", None)
            if eta_val is not None and eta_val not in (0, 15, 30, 60, 90):
                eta_val = None  # reject invalid values silently
            queue_user = self.queue_service.create_booking(
                user_id=booking_user_id,
                queue_id=queue_id,
                queue_date=data.queue_date,
                token_number=token_number,
                turn_time=total_service_time,
                notes=data.notes,
                is_scheduled=(data.queue_date > today_app_date()) or appointment_type in ("FIXED", "APPROXIMATE"),
                estimated_enqueue_time=estimated_enqueue_dt,
                estimated_dequeue_time=estimated_dequeue_dt,
                queue_services=queue_services,
                appointment_type=appointment_type,
                slot_id=slot_id,
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
                eta_minutes=eta_val,
                is_walk_in=bool(getattr(data, "is_walk_in", False)),
            )

            # Only add to Redis live queue for walk-ins (REGISTERED immediately).
            # SCHEDULED (Fixed/Approximate) appointments join when they activate.
            if data.queue_date == today_app_date() and queue_user.status == QUEUE_USER_REGISTERED:
                await queue_manager.add_to_queue(
                    db=self.db,
                    queue_id=str(queue_id),
                    user_id=str(booking_user_id),
                    date_str=date_str,
                    token_number=token_number,
                    total_service_time=total_service_time,
                    business_id=str(data.business_id)
                )

            services_data = [
                BookingServiceData(**d)
                for d in self.queue_service.get_booking_services_data(queue_services)
            ]
            result = BookingData.from_booking_created(
                queue_user, str(queue_id), queue.name,
                str(data.business_id), business.name, data.queue_date,
                metrics, services_data, token_number,
            )

            # Broadcast live queue update to employee UI and connected customers (today only)
            if data.queue_date == today_app_date():
                try:
                    await live_queue_manager.broadcast(
                        str(queue_id), date_str, "live_queue_update",
                        live_queue_manager.get_live_queue_state(self.db, str(queue_id), date_str)
                    )
                    await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), date_str)
                except Exception:
                    logger.warning("Live broadcast failed after booking queue_id=%s", queue_id, exc_info=True)

            # Fire-and-forget notifications — failures must never block booking
            try:
                assigned_emp = self.employee_service.get_verified_employee_by_queue(
                    queue_id=queue_id, business_id=data.business_id
                )
                employee_user_id = assigned_emp.user_id if assigned_emp else None

                await notify_booking_confirmed(
                    db=self.db,
                    user_id=booking_user_id,
                    token_number=str(token_number),
                    wait_minutes=int(metrics.get("wait_minutes") or 0),
                    queue_name=queue.name or "",
                    business_name=business.name or "",
                )
                await notify_new_customer(
                    db=self.db,
                    business_owner_id=business.owner_id,
                    employee_user_id=employee_user_id,
                    token_number=str(token_number),
                    queue_name=queue.name or "",
                )
            except Exception:
                logger.warning(
                    "Notification failed for booking token=%s", token_number, exc_info=True
                )

            return result

        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_booking (user_id=%s business_id=%s)", user_id, data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ─────────────────────────────────────────────────────────────────────────
    # Slots & Next customer (multi-mode appointments)
    # ─────────────────────────────────────────────────────────────────────────

    def get_queue_slots(self, queue_id: UUID, slot_date: date) -> SlotsListResponse:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            if queue.booking_mode not in (BOOKING_MODE_FIXED, BOOKING_MODE_APPROXIMATE, BOOKING_MODE_HYBRID):
                raise HTTPException(status_code=400, detail="Queue does not support scheduled slots")

            slot_svc = SlotGenerationService(self.db)
            slots = slot_svc.get_or_generate_slots(queue_id, slot_date, queue=queue)

            # Build (start, end) windows from active FIXED/APPROXIMATE bookings (business logic in controller).
            booking_rows = self.queue_service.get_active_scheduled_bookings_for_date(queue_id, slot_date)
            booking_windows: List[Tuple[time, time]] = []
            for qu in booking_rows:
                start_t = qu.scheduled_start
                if not start_t:
                    continue
                duration_minutes = sum(
                    (getattr(qus.queue_service, "avg_service_time", None) or DEFAULT_AVG_TIME)
                    for qus in (qu.queue_user_services or [])
                    if getattr(qus, "queue_service", None)
                )
                if duration_minutes <= 0:
                    duration_minutes = DEFAULT_AVG_TIME
                # For Approximate appointments the slot is a window [start, end].
                # The appointment can start as late as window_end, so the latest it
                # finishes is window_end + duration. Use that as the conservative block end.
                window_end_t = qu.scheduled_end if qu.scheduled_end else start_t
                end_dt = datetime.combine(slot_date, window_end_t) + timedelta(minutes=duration_minutes)
                end_t = end_dt.time()
                if end_dt.date() > slot_date:
                    end_t = time(23, 59, 59)
                booking_windows.append((start_t, end_t))

            # Block slots occupied by active walk-in queue (REGISTERED/IN_PROGRESS users).
            # For today: blocks from now until queue ends.
            # For future dates: blocks from open_dt until queue ends (pre-booked walk-ins).
            from app.services.realtime.live_queue_manager import calculate_queue_waits
            raw_rows = self.queue_service.get_today_active_queue_user_rows([queue_id], slot_date)
            if raw_rows:
                today = today_app_date()
                now_dt = now_app_tz() if slot_date == today else None
                open_dt = None
                breaks: list = []
                try:
                    calc_svc = BookingCalculationService(self.db)
                    open_time_val, _, breaks, _ = calc_svc.get_employee_window(queue, slot_date)
                    open_dt = APP_TZ.localize(datetime.combine(slot_date, open_time_val))
                except Exception:
                    pass
                if now_dt is None:
                    now_dt = open_dt or APP_TZ.localize(datetime.combine(slot_date, time(0, 0)))
                waits = calculate_queue_waits(raw_rows, now=now_dt, open_dt=open_dt, breaks=breaks)
                ordered = waits["ordered_waiting"]
                wait_data = waits["wait_data"]
                queue_cursor_end_ms = None
                if ordered:
                    last_wd = wait_data.get(str(ordered[-1]["uuid"]), {})
                    queue_cursor_end_ms = last_wd.get("expected_end_ts")
                if queue_cursor_end_ms is None:
                    for row in raw_rows:
                        if row.get("status") == QUEUE_USER_IN_PROGRESS:
                            wd = wait_data.get(str(row["uuid"]), {})
                            queue_cursor_end_ms = wd.get("expected_end_ts") or wd.get("expected_at_ts")
                            break
                if queue_cursor_end_ms:
                    queue_ends_t = datetime.fromtimestamp(queue_cursor_end_ms / 1000, tz=APP_TZ).time()
                    booking_windows.append((now_dt.time(), queue_ends_t))

            # For today, skip slots that have already started so customers only see future slots.
            today = today_app_date()
            cutoff_time = current_time_app_tz() if slot_date == today else None

            def slot_overlaps_booking(slot_start, slot_end, windows):
                """True if [slot_start, slot_end) overlaps any (start, end) in windows."""
                for b_start, b_end in windows:
                    if slot_start < b_end and slot_end > b_start:
                        return True
                return False

            slot_list = []
            for s in slots:
                if cutoff_time is not None and s.slot_start <= cutoff_time:
                    continue
                overlaps = slot_overlaps_booking(s.slot_start, s.slot_end, booking_windows)
                base_available = not s.is_blocked and s.booked_count < s.capacity
                available = base_available and not overlaps
                remaining = 0 if overlaps else max(0, (s.capacity or 1) - s.booked_count)
                slot_list.append(
                    SlotData(
                        uuid=str(s.uuid),
                        slot_start=s.slot_start.strftime("%H:%M") if s.slot_start else "",
                        slot_end=s.slot_end.strftime("%H:%M") if s.slot_end else "",
                        capacity=s.capacity,
                        booked_count=s.booked_count,
                        available=available,
                        remaining=remaining,
                    )
                )
            return SlotsListResponse.from_queue_and_slots(queue, slot_date, slot_list)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_queue_slots (queue_id=%s date=%s)", queue_id, slot_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_next_customer(self, queue_id: UUID, queue_date: date) -> Optional[NextCustomerResponse]:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            rows = self.queue_service.get_registered_queue_users_for_serving(queue_id, queue_date)
            if not rows:
                return None

            ist = pytz.timezone(TIMEZONE)
            now = datetime.now(ist)
            today = now.date()
            now_time = now.time()

            def _sort_key(qu):
                is_today = qu.queue_date == today
                st = qu.scheduled_start
                if qu.appointment_type == APPOINTMENT_TYPE_FIXED and qu.is_checked_in:
                    if not is_today or (st and st <= now_time):
                        return (0, st or time(0), qu.enqueue_time or datetime.min)
                    return (3, st or time(0), qu.enqueue_time or datetime.min)
                if qu.appointment_type == APPOINTMENT_TYPE_QUEUE:
                    return (1, time(0), qu.enqueue_time or datetime.min)
                if qu.appointment_type == APPOINTMENT_TYPE_APPROXIMATE and qu.is_checked_in:
                    if not is_today or (st and st <= now_time):
                        return (2, st or time(0), qu.enqueue_time or datetime.min)
                    return (4, st or time(0), qu.enqueue_time or datetime.min)
                return (5, st or time(0), qu.enqueue_time or datetime.min)

            rows.sort(key=_sort_key)
            qu = rows[0]
            return NextCustomerResponse.from_queue_user(qu)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_next_customer (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ─────────────────────────────────────────────────────────────────────────
    # Live Queue (Employee real-time view)
    # ─────────────────────────────────────────────────────────────────────────

    def is_employee_on_leave(self, queue: Any, queue_date: date) -> bool:
        calc = BookingCalculationService(self.db)
        _, _, _, employee_available = calc.get_employee_window(queue, queue_date)
        return not employee_available

    async def get_live_queue(self, queue_id: UUID) -> LiveQueueData:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")

            today = today_app_date()
            rows, svc_by_user = self.queue_service.get_live_queue_users_raw(queue_id, today)
            users_raw = build_live_queue_users_raw(rows, svc_by_user)
            employee_on_leave = self.is_employee_on_leave(queue, today)

            return self.build_live_queue_data(queue, today, users_raw, employee_on_leave)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_live_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def compute_overrun_minutes(self, completed_user: Any, dequeue_time: datetime) -> int:
        """Minutes the completed visit exceeded the planned turn_time. Used for delay propagation."""
        if not getattr(completed_user, "enqueue_time", None) or not dequeue_time:
            return 0
        turn_time = getattr(completed_user, "turn_time", None)
        if not turn_time or turn_time <= 0:
            return 0
        actual_minutes = int(
            (dequeue_time - completed_user.enqueue_time).total_seconds() / 60
        )
        overrun = actual_minutes - int(turn_time)
        return overrun if overrun > 0 else 0

    async def advance_queue(self, queue_id: UUID) -> LiveQueueData:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")

            today = today_app_date()
            if self.is_employee_on_leave(queue, today):
                raise HTTPException(
                    status_code=403,
                    detail="Employee is on leave today. Queue cannot be advanced.",
                )

            # Business logic: who to complete, who to start, overrun, delay propagation
            active_users = self.queue_service.get_active_queue_users_with_lock(queue_id, today)
            in_progress = next(
                (u for u in active_users if u.status == QUEUE_USER_IN_PROGRESS), None
            )
            waiting = sorted(
                [u for u in active_users if u.status == QUEUE_USER_REGISTERED],
                key=lambda u: (u.enqueue_time or u.created_at or datetime.min.replace(tzinfo=timezone.utc)),
            )
            if not in_progress and not waiting:
                raise ValueError("No users to serve")

            now = datetime.now(timezone.utc)
            overrun = 0
            if in_progress:
                overrun = self.compute_overrun_minutes(in_progress, now)
                self.queue_service.mark_queue_user_completed(in_progress.uuid, now)
            if waiting:
                first_waiting = waiting[0]
                self.queue_service.mark_queue_user_in_progress(first_waiting.uuid, now)
            if in_progress and overrun > 0:
                self.queue_service.add_delay_to_later_approx_bookings(
                    queue_id,
                    today,
                    in_progress.enqueue_time,
                    getattr(in_progress, "created_at", None),
                    in_progress.uuid,
                    overrun,
                )
            self.queue_service.commit_advance()

            # Fire-and-forget notifications — must not block queue advance
            try:
                if in_progress:
                    await notify_service_completed(
                        db=self.db,
                        user_id=in_progress.user_id,
                        token_number=str(in_progress.token_number or ""),
                        queue_name=queue.name or "",
                    )
                if waiting:
                    await notify_in_service(
                        db=self.db,
                        user_id=first_waiting.user_id,
                        token_number=str(first_waiting.token_number or ""),
                        queue_name=queue.name or "",
                    )
                    if len(waiting) > 1:
                        called_next = waiting[1]
                        await notify_called_next(
                            db=self.db,
                            user_id=called_next.user_id,
                            token_number=str(called_next.token_number or ""),
                            queue_name=queue.name or "",
                        )
            except Exception:
                logger.warning(
                    "Notification failed for advance_queue queue_id=%s", queue_id, exc_info=True
                )

            rows, svc_by_user = self.queue_service.get_live_queue_users_raw(queue_id, today)
            users_raw = build_live_queue_users_raw(rows, svc_by_user)
            employee_on_leave = self.is_employee_on_leave(queue, today)
            live_data = self.build_live_queue_data(queue, today, users_raw, employee_on_leave)

            # Broadcast to all connected WS clients
            date_str = today.isoformat()
            await live_queue_manager.broadcast(
                str(queue_id), date_str, "live_queue_update", live_data.model_dump(mode="json")
            )
            await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), date_str)

            return live_data
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"message": str(e)})
        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to advance_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def no_show_current(self, queue_id: UUID) -> LiveQueueData:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            today = today_app_date()
            if self.is_employee_on_leave(queue, today):
                raise HTTPException(status_code=403, detail="Employee is on leave today. Queue cannot be modified.")

            active_users = self.queue_service.get_active_queue_users_with_lock(queue_id, today)
            in_progress = next((u for u in active_users if u.status == QUEUE_USER_IN_PROGRESS), None)
            if not in_progress:
                raise ValueError("No user is currently in progress")
            waiting = sorted(
                [u for u in active_users if u.status == QUEUE_USER_REGISTERED],
                key=lambda u: (u.enqueue_time or u.created_at or datetime.min.replace(tzinfo=timezone.utc)),
            )
            now = datetime.now(timezone.utc)
            self.queue_service.mark_queue_user_failed(in_progress.uuid, now)
            first_waiting = None
            if waiting:
                first_waiting = waiting[0]
                self.queue_service.mark_queue_user_in_progress(first_waiting.uuid, now)
            self.queue_service.commit_advance()

            try:
                await notify_no_show(
                    db=self.db, user_id=in_progress.user_id,
                    token_number=str(in_progress.token_number or ""), queue_name=queue.name or "",
                )
                if first_waiting:
                    await notify_in_service(
                        db=self.db, user_id=first_waiting.user_id,
                        token_number=str(first_waiting.token_number or ""), queue_name=queue.name or "",
                    )
                    if len(waiting) > 1:
                        await notify_called_next(
                            db=self.db, user_id=waiting[1].user_id,
                            token_number=str(waiting[1].token_number or ""), queue_name=queue.name or "",
                        )
            except Exception:
                logger.warning("Notification failed for no_show_current queue_id=%s", queue_id, exc_info=True)

            rows, svc_by_user = self.queue_service.get_live_queue_users_raw(queue_id, today)
            users_raw = build_live_queue_users_raw(rows, svc_by_user)
            live_data = self.build_live_queue_data(queue, today, users_raw, self.is_employee_on_leave(queue, today))
            date_str = today.isoformat()
            await live_queue_manager.broadcast(str(queue_id), date_str, "live_queue_update", live_data.model_dump(mode="json"))
            await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), date_str)
            return live_data
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"message": str(e)})
        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to no_show_current (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def skip_current(self, queue_id: UUID) -> LiveQueueData:
        try:
            queue = self.queue_service.get_queue_by_id(queue_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            today = today_app_date()
            if self.is_employee_on_leave(queue, today):
                raise HTTPException(status_code=403, detail="Employee is on leave today. Queue cannot be modified.")

            active_users = self.queue_service.get_active_queue_users_with_lock(queue_id, today)
            in_progress = next((u for u in active_users if u.status == QUEUE_USER_IN_PROGRESS), None)
            if not in_progress:
                raise ValueError("No user is currently in progress")
            waiting = sorted(
                [u for u in active_users if u.status == QUEUE_USER_REGISTERED],
                key=lambda u: (u.enqueue_time or u.created_at or datetime.min.replace(tzinfo=timezone.utc)),
            )
            now = datetime.now(timezone.utc)
            self.queue_service.mark_queue_user_skipped(in_progress.uuid, now)
            first_waiting = None
            if waiting:
                first_waiting = waiting[0]
                self.queue_service.mark_queue_user_in_progress(first_waiting.uuid, now)
            self.queue_service.commit_advance()

            try:
                await notify_skipped(
                    db=self.db, user_id=in_progress.user_id,
                    token_number=str(in_progress.token_number or ""), queue_name=queue.name or "",
                )
                if first_waiting:
                    await notify_in_service(
                        db=self.db, user_id=first_waiting.user_id,
                        token_number=str(first_waiting.token_number or ""), queue_name=queue.name or "",
                    )
                    if len(waiting) > 1:
                        await notify_called_next(
                            db=self.db, user_id=waiting[1].user_id,
                            token_number=str(waiting[1].token_number or ""), queue_name=queue.name or "",
                        )
            except Exception:
                logger.warning("Notification failed for skip_current queue_id=%s", queue_id, exc_info=True)

            rows, svc_by_user = self.queue_service.get_live_queue_users_raw(queue_id, today)
            users_raw = build_live_queue_users_raw(rows, svc_by_user)
            live_data = self.build_live_queue_data(queue, today, users_raw, self.is_employee_on_leave(queue, today))
            date_str = today.isoformat()
            await live_queue_manager.broadcast(str(queue_id), date_str, "live_queue_update", live_data.model_dump(mode="json"))
            await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), date_str)
            return live_data
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"message": str(e)})
        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to skip_current (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def start_queue(self, queue_id: UUID, business_id: UUID) -> QueueData:
        try:
            queue = self.queue_service.get_queue_by_id_and_business(queue_id, business_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")

            today = today_app_date()
            if self.is_employee_on_leave(queue, today):
                raise HTTPException(
                    status_code=403,
                    detail="Employee is on leave today. Queue cannot be started.",
                )

            self.queue_service.set_queue_status(queue_id, QUEUE_RUNNING)

            today_str = today_app_date().isoformat()
            await live_queue_manager.broadcast(
                str(queue_id), today_str, "queue_started",
                {"queue_id": str(queue_id), "queue_status": QUEUE_RUNNING}
            )
            await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), today_str)

            return QueueData.from_queue(queue)
        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to start_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def stop_queue(self, queue_id: UUID, business_id: UUID) -> QueueData:
        try:
            queue = self.queue_service.get_queue_by_id_and_business(queue_id, business_id)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")

            today = today_app_date()
            if self.is_employee_on_leave(queue, today):
                raise HTTPException(
                    status_code=403,
                    detail="Employee is on leave today. Queue cannot be stopped.",
                )

            self.queue_service.set_queue_status(queue_id, QUEUE_STOPPED)

            today_str = today_app_date().isoformat()
            await live_queue_manager.broadcast(
                str(queue_id), today_str, "queue_stopped",
                {"queue_id": str(queue_id), "queue_status": QUEUE_STOPPED}
            )
            await customer_queue_manager.broadcast_to_queue(self.db, str(queue_id), today_str)

            return QueueData.from_queue(queue)
        except HTTPException:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to stop_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def build_live_queue_data(
        self, queue: Any, queue_date: date, users_raw: list, employee_on_leave: bool = False
    ) -> LiveQueueData:
        open_dt = None
        breaks: list = []
        try:
            calc = BookingCalculationService(self.db)
            open_time, _, breaks, _ = calc.get_employee_window(queue, queue_date)
            open_dt = APP_TZ.localize(datetime.combine(queue_date, open_time))
        except Exception:
            pass
        return LiveQueueData.from_build(queue, queue_date, users_raw, employee_on_leave, open_dt=open_dt, breaks=breaks)

    def get_existing_booking(
        self,
        user_id: UUID,
        queue_id: UUID,
        queue_date: date,
        business_id: UUID,
        queue: Any,
        business: Any,
        calc_service: BookingCalculationService,
    ) -> Optional[BookingData]:
        """Return a BookingData for an existing same-day booking, or None if no duplicate."""
        existing = self.queue_service.get_existing_same_day_booking(user_id, queue_id, queue_date)
        if not existing:
            return None

        existing_full = self.queue_service.get_queue_user_by_id_with_relations(existing.uuid) or existing
        metrics = calc_service.get_existing_queue_user_metrics(existing_full)

        services_data = []
        for qus in existing_full.queue_user_services or []:
            qs = getattr(qus, "queue_service", None)
            if qs and getattr(qs, "service", None):
                s = qs.service
                services_data.append(BookingServiceData(
                    uuid=str(qs.uuid),
                    name=s.name,
                    price=getattr(qs, "service_fee", None),
                    duration=getattr(qs, "avg_service_time", None),
                ))

        return BookingData.from_existing_booking(
            existing_full, str(queue_id), queue.name,
            str(business_id), business.name, queue_date,
            metrics, services_data,
        )

    def get_today_appointments(self, user_id: UUID) -> CustomerTodayAppointmentsResponse:
        """Return all of today's active (waiting or in_progress) appointments for the customer."""
        try:
            today = today_app_date()
            queue_users = self.queue_service.get_today_active_appointments_for_user(user_id, today)
            if not queue_users:
                return CustomerTodayAppointmentsResponse(items=[])

            calc_service = BookingCalculationService(self.db)
            app_tz = pytz.timezone(TIMEZONE)
            waits_by_queue: dict = {}
            for qu in queue_users:
                qid = str(qu.queue_id)
                if qid not in waits_by_queue:
                    try:
                        rows, svc_by_user = self.queue_service.get_live_queue_users_raw(
                            qu.queue_id, today
                        )
                        users_raw = build_live_queue_users_raw(rows, svc_by_user)
                        open_dt = None
                        breaks: list = []
                        if qu.queue:
                            open_time, _, breaks, _ = calc_service.get_employee_window(qu.queue, today)
                            open_dt = app_tz.localize(datetime.combine(today, open_time))
                        result = calculate_queue_waits(users_raw, open_dt=open_dt, breaks=breaks)
                        waits_by_queue[qid] = result
                    except Exception:
                        waits_by_queue[qid] = {"current_token": None, "wait_data": {}}
            items = []
            for qu in queue_users:
                queue = qu.queue
                business = getattr(queue, "business", None)
                business_name = business.name if business else ""
                business_id = str(queue.merchant_id) if queue else ""

                metrics = calc_service.get_existing_queue_user_metrics(qu)

                service_names = []
                qs_uuids = []
                for qus in getattr(qu, "queue_user_services", []) or []:
                    qs = getattr(qus, "queue_service", None)
                    if qs:
                        qs_uuids.append(str(qs.uuid))
                        if getattr(qs, "service", None):
                            service_names.append(qs.service.name)
                service_summary = " · ".join(service_names) if service_names else None

                queue_waits = waits_by_queue.get(str(qu.queue_id), {})
                on_break_until = queue_waits.get("on_break_until")
                on_break_until_ts = queue_waits.get("on_break_until_ts")
                wd = queue_waits.get("wait_data", {}).get(str(qu.uuid), {})
                expected_at_ts = wd.get("expected_at_ts")
                expected_end_ts = wd.get("expected_end_ts")
                estimated_end_time = wd.get("estimated_end_time")
                service_duration_minutes = wd.get("service_duration_minutes")
                spans_break = wd.get("spans_break", False)
                break_during_label = wd.get("break_during_label")
                dynamic_appt_time = metrics.get("appointment_time") or wd.get("estimated_appointment_time")
                live_wait = wd.get("estimated_wait_minutes")
                if live_wait is not None:
                    metrics = {**metrics, "wait_minutes": live_wait}

                items.append(
                    CustomerTodayAppointmentResponse.from_queue_user_and_metrics(
                        qu, queue, business_id, business_name,
                        metrics, service_summary, dynamic_appt_time,
                        queue_service_uuids=qs_uuids,
                        expected_at_ts=expected_at_ts,
                        current_token=queue_waits.get("current_token"),
                        expected_end_ts=expected_end_ts,
                        estimated_end_time=estimated_end_time,
                        service_duration_minutes=service_duration_minutes,
                        on_break_until=on_break_until,
                        on_break_until_ts=on_break_until_ts,
                        spans_break=spans_break,
                        break_during_label=break_during_label,
                    )
                )
            return CustomerTodayAppointmentsResponse(items=items)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_today_appointments (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ── Scheduled jobs ─────────────────────────────────────────────────────────

    def check_and_notify_eta(self) -> int:
        """
        Called every minute by the scheduler.
        For users with a self-declared ETA who haven't been notified yet:
        if their position ≤ 3 AND estimated wait ≤ their eta_minutes → send "head out now" notification.
        Returns count of notifications sent.
        """
        today = today_app_date()
        now = now_app_tz()
        notified = 0

        candidates = self.queue_service.get_eta_notification_candidates(today)

        for qu in candidates:
            try:
                metrics = self.queue_service.get_queue_user_ahead_metrics(
                    queue_id=qu.queue_id,
                    queue_date=qu.queue_date,
                    enqueue_time=qu.enqueue_time,
                    created_at=qu.created_at,
                    exclude_queue_user_id=qu.uuid,
                )
                position = metrics["ahead_count"] + 1
                wait_minutes = metrics["total_wait_minutes"]

                if position > 3 or wait_minutes > (qu.eta_minutes or 0):
                    continue

                self.queue_service.mark_heading_notified(qu, now)
                queue_name = qu.queue.name if qu.queue else ""
                notify_heading_now_sync(
                    db=self.db,
                    user_id=qu.user_id,
                    token_number=qu.token_number or "",
                    queue_name=queue_name,
                    wait_minutes=wait_minutes,
                )
                notified += 1
            except Exception:
                logger.exception("check_and_notify_eta: error for queue_user=%s", qu.uuid)
                continue

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("check_and_notify_eta: commit failed")

        return notified
