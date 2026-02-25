from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional, Any
from datetime import date, datetime, time, timedelta

from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.realtime.queue_manager import queue_manager
from app.services.realtime.live_queue_manager import live_queue_manager
from app.schemas.queue import (
    QueueCreate, QueueData, QueueDetailData, QueueServiceDetailData,
    QueueUpdate, QueueServicesAdd, QueueServiceUpdate,
    QueueUserData, QueueUserDetailResponse, QueueUserDetailUserInfo,
    AvailableSlotData, BookingCreateInput, BookingData, BookingServiceData, BookingPreviewData,
    LiveQueueData, LiveQueueUserItem,
)
from app.schemas.user import UserData
from app.schemas.service import ServiceData
from app.models.service import Service
from app.models.queue import QueueUser, QueueUserService
from app.core.constants import (
    BUSINESS_REGISTERED, QUEUE_USER_REGISTERED,
    QUEUE_RUNNING, QUEUE_STOPPED,
    QUEUE_USER_IN_PROGRESS, QUEUE_USER_COMPLETED,
)
from app.core.utils import (
    build_live_queue_users_raw,
    format_time_12h,
    today_app_date,
    wait_minutes_from_now,
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
            services = self.db.query(Service).filter(Service.uuid.in_(service_ids)).all() if service_ids else []
            if service_ids and len(services) != len(service_ids):
                raise HTTPException(400, "One or more services not found")

            queue = self.queue_service.create_queue(data=data, services=services)
            self.business_service.update_registration_state(
                business_id=data.business_id, status=BUSINESS_REGISTERED, current_step=None
            )
            self.db.commit()
            return QueueData.from_queue(queue)
        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error occurred while creating queue: {str(e)}")
        except Exception as e:
            self.db.rollback()
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
                QueueServiceDetailData(
                    uuid=qs.uuid,
                    service_id=qs.service_id,
                    service_name=getattr(svc, "name", None),
                    description=getattr(qs, "description", None) or getattr(svc, "description", None),
                    service_fee=getattr(qs, "service_fee", None),
                    avg_service_time=getattr(qs, "avg_service_time", None),
                )
                for qs, svc in rows
            ]
            assigned_employee_id = queue.employees[0].uuid if queue.employees else None
            return QueueDetailData(
                uuid=queue.uuid,
                business_id=queue.merchant_id,
                name=queue.name,
                status=queue.status,
                limit=getattr(queue, "limit", None),
                current_length=getattr(queue, "current_length", None),
                assigned_employee_id=assigned_employee_id,
                services=services,
            )
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
            services = {s.uuid: s for s in self.db.query(Service).filter(Service.uuid.in_(service_ids)).all()}
            return [
                QueueServiceDetailData(
                    uuid=qs.uuid,
                    service_id=qs.service_id,
                    service_name=getattr(services.get(qs.service_id), "name", None),
                    description=qs.description,
                    service_fee=qs.service_fee,
                    avg_service_time=qs.avg_service_time,
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
            svc = self.db.query(Service).filter(Service.uuid == qs.service_id).first()
            return QueueServiceDetailData(
                uuid=qs.uuid,
                service_id=qs.service_id,
                service_name=svc.name if svc else None,
                description=qs.description,
                service_fee=qs.service_fee,
                avg_service_time=qs.avg_service_time,
            )
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
            service_names = [
                rel.queue_service.service.name
                for rel in (queue_user.queue_user_services or [])
                if rel.queue_service and rel.queue_service.service
            ]
            employee_id = str(queue_user.queue.employees[0].uuid) if queue_user.queue.employees else None
            return QueueUserDetailResponse(
                user=QueueUserDetailUserInfo(
                    full_name=queue_user.user.full_name,
                    email=queue_user.user.email,
                    phone_number=queue_user.user.phone_number,
                    country_code=queue_user.user.country_code,
                    profile_picture=queue_user.user.profile_picture,
                ),
                queue_name=queue_user.queue.name,
                service_names=service_names,
                queue_user_id=str(queue_user.uuid),
                token_number=queue_user.token_number,
                queue_date=queue_user.queue_date,
                enqueue_time=queue_user.enqueue_time,
                dequeue_time=queue_user.dequeue_time,
                status=queue_user.status,
                priority=queue_user.priority,
                turn_time=queue_user.turn_time,
                estimated_enqueue_time=queue_user.estimated_enqueue_time,
                estimated_dequeue_time=queue_user.estimated_dequeue_time,
                joined_queue=queue_user.joined_queue,
                is_scheduled=queue_user.is_scheduled,
                notes=queue_user.notes,
                cancellation_reason=queue_user.cancellation_reason,
                reschedule_count=queue_user.reschedule_count,
                employee_id=employee_id
            )
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
            return [
                QueueUserData(
                    uuid=queue_user.uuid,  # type: ignore[arg-type]
                    user=UserData.from_user(user),
                    queue_id=queue_user.queue_id,  # type: ignore[arg-type]
                    queue_date=queue_user.queue_date,  # type: ignore[arg-type]
                    token_number=queue_user.token_number,  # type: ignore[arg-type]
                    status=queue_user.status,  # type: ignore[arg-type]
                    priority=bool(queue_user.priority),
                    enqueue_time=queue_user.enqueue_time,  # type: ignore[arg-type]
                    dequeue_time=queue_user.dequeue_time,  # type: ignore[arg-type]
                )
                for queue_user, user in rows
            ]
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

            date_str = data.queue_date.strftime("%Y-%m-%d")
            token_number = await queue_manager.generate_token_number(str(queue_id), date_str)

            from datetime import datetime as dt
            try:
                appt_hour, appt_min = map(int, metrics["appointment_time"].split(":"))
                estimated_enqueue_dt = dt.combine(data.queue_date, time(appt_hour, appt_min))
                estimated_dequeue_dt = estimated_enqueue_dt + timedelta(minutes=total_service_time)
            except Exception:
                estimated_enqueue_dt = None
                estimated_dequeue_dt = None

            queue_user = QueueUser(
                user_id=user_id,
                queue_id=queue_id,
                queue_date=data.queue_date,
                token_number=token_number,
                status=QUEUE_USER_REGISTERED,
                turn_time=total_service_time,
                notes=data.notes,
                is_scheduled=(data.queue_date > today_app_date()),
                estimated_enqueue_time=estimated_enqueue_dt,
                estimated_dequeue_time=estimated_dequeue_dt
            )
            self.db.add(queue_user)
            self.db.flush()

            for qs in queue_services:
                self.db.add(QueueUserService(
                    queue_user_id=queue_user.uuid,
                    queue_service_id=qs.uuid
                ))

            self.db.commit()

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

            return BookingData(
                uuid=str(queue_user.uuid),
                token_number=token_number,
                queue_id=str(queue_id),
                queue_name=queue.name,
                business_id=str(data.business_id),
                business_name=business.name,
                queue_date=data.queue_date,
                position=metrics["position"],
                estimated_wait_minutes=metrics["wait_minutes"],
                estimated_wait_range=metrics["wait_range"],
                estimated_appointment_time=metrics["appointment_time"],
                services=services_data,
                status="confirmed",
                created_at=datetime.now()
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
        waiting_count = sum(1 for u in users_raw if u["status"] == QUEUE_USER_REGISTERED)
        in_progress_count = sum(1 for u in users_raw if u["status"] == QUEUE_USER_IN_PROGRESS)
        completed_count = sum(1 for u in users_raw if u["status"] == QUEUE_USER_COMPLETED)

        current_token: Optional[str] = None
        for u in users_raw:
            if u["status"] == QUEUE_USER_IN_PROGRESS:
                current_token = u["token"]
                break

        return LiveQueueData(
            queue_id=str(queue.uuid),
            queue_name=queue.name,
            queue_status=queue.status,
            date=queue_date.isoformat(),
            waiting_count=waiting_count,
            in_progress_count=in_progress_count,
            completed_count=completed_count,
            current_token=current_token,
            employee_on_leave=employee_on_leave,
            users=[
                LiveQueueUserItem(
                    uuid=u["uuid"],
                    full_name=u["full_name"],
                    phone=u["phone"],
                    token=u["token"],
                    service_summary=u["service_summary"],
                    status=u["status"],
                    enqueue_time=u["enqueue_time"],
                    dequeue_time=u["dequeue_time"],
                    position=u["position"],
                    estimated_wait_minutes=(
                        wait_minutes_from_now(u.get("estimated_enqueue_time"))
                        if u["status"] == QUEUE_USER_REGISTERED
                        else None
                    ),
                    estimated_appointment_time=(
                        format_time_12h(u.get("estimated_dequeue_time"))
                        if u["status"] == QUEUE_USER_IN_PROGRESS and u.get("estimated_dequeue_time")
                        else format_time_12h(u.get("estimated_enqueue_time"))
                        if u["status"] == QUEUE_USER_REGISTERED and u.get("estimated_enqueue_time")
                        else None
                    ),
                )
                for u in users_raw
            ],
        )

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

        return BookingData(
            uuid=str(existing_full.uuid),
            token_number=existing_full.token_number or "",
            queue_id=str(queue_id),
            queue_name=queue.name,
            business_id=str(business_id),
            business_name=business.name,
            queue_date=queue_date,
            position=metrics["position"],
            estimated_wait_minutes=metrics["wait_minutes"],
            estimated_wait_range=metrics["wait_range"],
            estimated_appointment_time=metrics["appointment_time"],
            services=services_data,
            status="confirmed",
            created_at=existing_full.created_at or datetime.now(),
            already_in_queue=True,
        )
