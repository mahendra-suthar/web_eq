from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional, Any, Dict
from datetime import date, datetime, time

from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.realtime.queue_manager import queue_manager
from app.services.realtime.live_queue_manager import live_queue_manager
from app.schemas.queue import (
    QueueCreate, QueueData, QueueDetailData, QueueServiceDetailData,
    QueueUpdate, QueueServicesAdd, QueueServiceUpdate,
    QueueUserData, QueueUserDetailResponse,
    AvailableSlotData, BookingCreateInput, BookingData, BookingServiceData, BookingPreviewData,
    LiveQueueData,
    CustomerTodayAppointmentResponse,
)
from app.schemas.user import UserData
from app.schemas.service import ServiceData
from app.core.constants import (
    BUSINESS_REGISTERED, QUEUE_USER_REGISTERED,
    QUEUE_RUNNING, QUEUE_STOPPED,
    QUEUE_USER_IN_PROGRESS,
)
from app.core.utils import (
    build_live_queue_users_raw,
    format_time_12h,
    today_app_date,
    format_date_iso,
    appointment_time_to_enqueue_dequeue,
)
from app.services.booking_calculation_service import BookingCalculationService


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
            queue = self.queue_service.get_queue_by_id(queue_id)
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

            preview = calc_service.calculate_booking_preview(
                business_id, booking_date, service_ids
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

            business = self.business_service.get_business_by_id(data.business_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")

            queue_services = self.queue_service.get_queue_services_for_booking(
                data.service_ids, data.business_id
            )
            if not queue_services:
                raise HTTPException(status_code=400, detail="No valid services selected")

            # Auto-select optimal queue if not provided
            if data.queue_id:
                queue = self.queue_service.get_queue_by_id_and_business(
                    data.queue_id, data.business_id
                )
                if not queue:
                    raise HTTPException(status_code=404, detail="Queue not found")
                queue_id = data.queue_id

                if data.queue_date == today_app_date():
                    metrics = calc_service.calculate_today_queue_metrics(
                        queue_id, data.queue_date, data.service_ids
                    )
                else:
                    metrics = calc_service.calculate_future_queue_metrics(
                        queue_id, data.queue_date, data.service_ids
                    )
            else:
                optimal_queue = calc_service.find_optimal_queue(
                    data.business_id, data.queue_date, data.service_ids
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

            if data.queue_date == today_app_date():
                existing_booking = self.get_existing_booking(
                    user_id=user_id,
                    queue_id=queue_id,
                    queue_date=data.queue_date,
                    business_id=data.business_id,
                    queue=queue,
                    business=business,
                    calc_service=calc_service,
                )
                if existing_booking is not None:
                    return existing_booking

            total_service_time = sum((qs.avg_service_time or 5) for qs in queue_services)
            date_str = format_date_iso(data.queue_date)
            token_number = await queue_manager.generate_token_number(str(queue_id), date_str)
            estimated_enqueue_dt, estimated_dequeue_dt = appointment_time_to_enqueue_dequeue(
                metrics.get("appointment_time"),
                data.queue_date,
                total_service_time,
            )

            queue_user = self.queue_service.create_booking(
                user_id=user_id,
                queue_id=queue_id,
                queue_date=data.queue_date,
                token_number=token_number,
                turn_time=total_service_time,
                notes=data.notes,
                is_scheduled=(data.queue_date > today_app_date()),
                estimated_enqueue_time=estimated_enqueue_dt,
                estimated_dequeue_time=estimated_dequeue_dt,
                queue_services=queue_services,
            )

            if data.queue_date == today_app_date():
                await queue_manager.add_to_queue(
                    db=self.db,
                    queue_id=str(queue_id),
                    user_id=str(user_id),
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

            self.queue_service.advance_queue(queue_id, today)

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

    def get_today_appointment(self, user_id: UUID) -> Optional[CustomerTodayAppointmentResponse]:
        """Return today's active (waiting or in_progress) appointment for the customer, or None."""
        today = today_app_date()
        qu = self.queue_service.get_today_active_appointment_for_user(user_id, today)
        if not qu:
            return None
        queue = qu.queue
        business = getattr(queue, "business", None)
        business_name = business.name if business else ""
        business_id = str(queue.merchant_id) if queue else ""

        calc_service = BookingCalculationService(self.db)
        metrics = calc_service.get_existing_queue_user_metrics(qu)

        service_names = []
        for qus in getattr(qu, "queue_user_services", []) or []:
            qs = getattr(qus, "queue_service", None)
            if qs and getattr(qs, "service", None):
                service_names.append(qs.service.name)
        service_summary = " · ".join(service_names) if service_names else None

        appointment_time_12h = None
        appointment_time_str = metrics.get("appointment_time")
        if appointment_time_str:
            try:
                parts = appointment_time_str.split(":")
                if len(parts) >= 2:
                    h, m = int(parts[0]), int(parts[1])
                    appointment_time_12h = format_time_12h(
                        datetime.combine(today_app_date(), time(h, m))
                    )
            except Exception:
                pass

        return CustomerTodayAppointmentResponse.from_queue_user_and_metrics(
            qu, queue, business_id, business_name,
            metrics, service_summary, appointment_time_12h,
        )