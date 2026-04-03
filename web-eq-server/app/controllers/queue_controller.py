from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional, Any, Dict, Tuple
from datetime import date, datetime, time, timedelta, timezone

import pytz

from app.core.constants import TIMEZONE
from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.realtime.queue_manager import queue_manager
from app.services.realtime.live_queue_manager import live_queue_manager
from app.schemas.queue import (
    QueueCreate, QueueCreateBatch, QueueData, QueueDetailData, QueueServiceDetailData,
    QueueUpdate, QueueServicesAdd, QueueServiceUpdate,
    QueueUserData, QueueUserDetailResponse,
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
from app.core.constants import (
    BUSINESS_REGISTERED, QUEUE_USER_REGISTERED,
    QUEUE_RUNNING, QUEUE_STOPPED,
    QUEUE_USER_IN_PROGRESS, QUEUE_USER_COMPLETED,
    TIME_FORMAT,
    DEFAULT_AVG_TIME,
)
from app.core.utils import (
    build_live_queue_users_raw,
    today_app_date,
    current_time_app_tz,
    format_date_iso,
    appointment_time_to_enqueue_dequeue,
)
from app.services.booking_calculation_service import BookingCalculationService
from app.services.slot_generation_service import SlotGenerationService
from app.services.user_service import UserService
from app.core.constants import (
    BOOKING_MODE_FIXED,
    BOOKING_MODE_APPROXIMATE,
    BOOKING_MODE_HYBRID,
    APPOINTMENT_TYPE_FIXED,
    APPOINTMENT_TYPE_QUEUE,
    APPOINTMENT_TYPE_APPROXIMATE,
)


class QueueController:
    def __init__(self, db: Session):
        self.db = db
        self.queue_service = QueueService(db)
        self.business_service = BusinessService(db)

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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error occurred while creating queue: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create queue: {str(e)}")

    async def create_queues_batch(self, data: QueueCreateBatch) -> List[QueueData]:
        if not data.queues:
            raise HTTPException(400, "At least one queue is required")
        try:
            queues = self.queue_service.create_queues_batch(data.business_id, data.queues)
            self.business_service.update_registration_state(
                business_id=data.business_id, status=BUSINESS_REGISTERED, current_step=None
            )
            return [QueueData.from_queue(q) for q in queues]
        except ValueError as e:
            raise HTTPException(400, str(e))
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to create queues: {str(e)}")

    async def get_queues(self, business_id: UUID) -> List[QueueData]:
        try:
            queues = self.queue_service.get_queues(business_id)
            return [QueueData.from_queue(queue) for queue in queues]
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error occurred while getting queue: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get queue: {str(e)}")

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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error occurred while getting queue: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get queue: {str(e)}")

    async def update_queue(self, queue_id: UUID, business_id: UUID, data: QueueUpdate) -> QueueData:
        try:
            queue = self.queue_service.update_queue(queue_id, business_id, data)
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            return QueueData.from_queue(queue)
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error while updating queue: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update queue: {str(e)}")

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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error while adding services: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to add services: {str(e)}")

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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error while updating queue service: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to update queue service: {str(e)}")

    async def delete_queue_service(self, queue_service_id: UUID) -> None:
        try:
            ok = self.queue_service.delete_queue_service(queue_service_id)
            if not ok:
                raise HTTPException(status_code=404, detail="Queue service not found")
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error while removing queue service: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to remove queue service: {str(e)}")

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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get queue user detail: {str(e)}")

    async def get_business_services(self, business_id: UUID) -> List[ServiceData]:
        try:
            services = self.queue_service.get_business_services(business_id)
            return [
                ServiceData.from_queue_service_and_service(queue_service, service)
                for queue_service, service in services
            ]
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error occurred while getting services: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get services: {str(e)}")

    async def get_users(
        self,
        *,
        business_id: UUID | None,
        queue_id: UUID | None,
        employee_id: UUID | None,
        page: int,
        limit: int,
        search: str | None,
    ) -> list[QueueUserData]:
        try:
            rows = self.queue_service.get_queue_users(
                business_id=business_id,
                queue_id=queue_id,
                employee_id=employee_id,
                page=page,
                limit=limit,
                search=search,
            )
            return [QueueUserData.from_row(queue_user, user) for queue_user, user in rows]
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error occurred while getting queue users: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get queue users: {str(e)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Customer Booking APIs
    # ─────────────────────────────────────────────────────────────────────────

    def _build_today_metrics(
        self,
        queue_ids: List[UUID],
        raw_rows: List[dict],
        current_time: datetime,
    ) -> Dict[UUID, Dict[str, Any]]:
        """Build per-queue metrics from DB rows (delay-aware for in-progress)."""
        result: Dict[UUID, Dict[str, Any]] = {
            qid: {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0}
            for qid in queue_ids
        }
        for row in raw_rows:
            qid = row["queue_id"]
            status = row["status"]
            turn = row.get("turn_time") or 0
            if status == QUEUE_USER_REGISTERED:
                result[qid]["registered_count"] += 1
                result[qid]["total_wait_minutes"] += turn
            elif status == QUEUE_USER_IN_PROGRESS:
                result[qid]["in_progress_count"] += 1
                enqueue_time = row.get("enqueue_time")
                if current_time and enqueue_time:
                    try:
                        enqueue_dt = enqueue_time
                        if enqueue_dt.tzinfo is None:
                            enqueue_dt = enqueue_dt.replace(tzinfo=timezone.utc)
                        elapsed = max(0.0, (current_time - enqueue_dt).total_seconds() / 60)
                        remaining = max(0, turn - int(elapsed))
                    except Exception:
                        remaining = turn
                else:
                    remaining = turn
                result[qid]["total_wait_minutes"] += remaining
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

    async def get_booking_preview(
        self,
        business_id: UUID,
        booking_date: date,
        service_ids: List[UUID]
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
            today_metrics = self._build_today_metrics(queue_ids, raw_users, current_time) if booking_date == today else {}
            services_by_queue = self._build_services_by_queue(raw_services)

            preview = calc_service.calculate_booking_preview(
                business_id, booking_date, service_ids,
                today_metrics=today_metrics,
                services_by_queue=services_by_queue,
            )
            return BookingPreviewData(**preview)

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get booking preview: {str(e)}")

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
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get available slots: {str(e)}")

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
                    today_metrics_single = self._build_today_metrics(
                        [queue_id], raw_users, current_time
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
                    today_metrics = self._build_today_metrics(qids, raw_users, current_time) if qids else {}
                    services_by_queue = self._build_services_by_queue(raw_services)
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

            if data.queue_date == today_app_date() and not is_walk_in:
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
                queue_time_conflict = self.queue_service.get_queue_booking_at_estimated_time(
                    user_id=booking_user_id,
                    queue_date=data.queue_date,
                    appointment_time_str=metrics["appointment_time"],
                    tolerance_minutes=max(preliminary_service_time, 15),
                )
                if queue_time_conflict:
                    raise HTTPException(
                        status_code=409,
                        detail="You already have an appointment around this time. Please choose a different date or time.",
                    )

            if appointment_type in ("FIXED", "APPROXIMATE") and slot_id:
                slot = self.queue_service.get_slot_by_id(slot_id)
                if not slot:
                    raise HTTPException(status_code=404, detail="Slot not found")
                if str(slot.queue_id) != str(queue_id) or slot.slot_date != data.queue_date:
                    raise HTTPException(status_code=400, detail="Slot does not match selected queue or date")
                if slot.is_blocked:
                    raise HTTPException(status_code=409, detail="Slot is not available")
                if not is_walk_in:
                    conflict = self.queue_service.get_booking_at_time(
                        user_id=booking_user_id,
                        queue_date=data.queue_date,
                        slot_start=slot.slot_start,
                    )
                    if conflict:
                        raise HTTPException(
                            status_code=409,
                            detail="You already have an appointment at this time. Please choose a different time slot.",
                        )
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
            )

            if data.queue_date == today_app_date():
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
            return BookingData.from_booking_created(
                queue_user, str(queue_id), queue.name,
                str(data.business_id), business.name, data.queue_date,
                metrics, services_data, token_number,
            )

        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create booking: {str(e)}")

    # ─────────────────────────────────────────────────────────────────────────
    # Slots & Next customer (multi-mode appointments)
    # ─────────────────────────────────────────────────────────────────────────

    def get_queue_slots(self, queue_id: UUID, slot_date: date) -> SlotsListResponse:
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
            end_dt = datetime.combine(slot_date, start_t) + timedelta(minutes=duration_minutes)
            end_t = end_dt.time()
            if end_dt.date() > slot_date:
                end_t = time(23, 59, 59)
            booking_windows.append((start_t, end_t))

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

    def get_next_customer(self, queue_id: UUID, queue_date: date) -> Optional[NextCustomerResponse]:
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
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get live queue: {str(e)}")

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
            self.db.commit()

            rows, svc_by_user = self.queue_service.get_live_queue_users_raw(queue_id, today)
            users_raw = build_live_queue_users_raw(rows, svc_by_user)
            employee_on_leave = self.is_employee_on_leave(queue, today)
            live_data = self.build_live_queue_data(queue, today, users_raw, employee_on_leave)

            # Broadcast to all connected WS clients
            date_str = today.isoformat()
            await live_queue_manager.broadcast(
                str(queue_id), date_str, "live_queue_update", live_data.model_dump()
            )

            return live_data
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to advance queue: {str(e)}")

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

            return QueueData.from_queue(queue)
        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to start queue: {str(e)}")

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

            return QueueData.from_queue(queue)
        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to stop queue: {str(e)}")

    def build_live_queue_data(
        self, queue: Any, queue_date: date, users_raw: list, employee_on_leave: bool = False
    ) -> LiveQueueData:
        return LiveQueueData.from_build(queue, queue_date, users_raw, employee_on_leave)

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
        today = today_app_date()
        queue_users = self.queue_service.get_today_active_appointments_for_user(user_id, today)
        if not queue_users:
            return CustomerTodayAppointmentsResponse(items=[])

        calc_service = BookingCalculationService(self.db)
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

            items.append(
                CustomerTodayAppointmentResponse.from_queue_user_and_metrics(
                    qu, queue, business_id, business_name,
                    metrics, service_summary, metrics.get("appointment_time"),
                    queue_service_uuids=qs_uuids,
                )
            )
        return CustomerTodayAppointmentsResponse(items=items)