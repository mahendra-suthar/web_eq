import logging
from sqlalchemy import func, extract, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from typing import List, Tuple, Dict, cast, Optional, Any
from collections import defaultdict
from uuid import UUID
from datetime import datetime, date, time, timedelta

from app.models.queue import Queue, QueueService as QueueServiceModel, QueueUser, QueueUserService, AppointmentSlot
from app.models.service import Service
from app.models.employee import Employee
from app.models.user import User
from app.models.business import Business
from app.schemas.queue import (
    QueueCreate,
    QueueCreateItem,
    QueueUpdate,
    QueueServiceAddItem,
    QueueServiceUpdate,
)
from app.core.utils import today_app_date, parse_time_string
from app.core.constants import (
    QUEUE_USER_REGISTERED,
    QUEUE_USER_IN_PROGRESS,
    QUEUE_USER_COMPLETED,
    QUEUE_USER_CANCELLED,
    QUEUE_USER_EXPIRED,
    DEFAULT_SLOT_MINUTES,
    SLOT_DURATION_FLOOR,
    SLOT_DURATION_CEILING,
    APPOINTMENT_TYPE_QUEUE,
    APPOINTMENT_TYPE_FIXED,
    APPOINTMENT_TYPE_APPROXIMATE,
)

logger = logging.getLogger(__name__)


class QueueService:
    def __init__(self, db: Session):
        self.db = db

    def create_single_queue(
        self,
        business_id: UUID,
        name: str,
        employee_id: Optional[UUID],
        services: List[Service],
        service_configs: Dict[UUID, Any],
        booking_mode: Optional[str] = None,
        slot_interval_minutes: Optional[int] = None,
        max_per_slot: Optional[int] = None,
    ) -> Queue:
        new_queue = Queue(
            merchant_id=business_id,
            name=name,
            status=1,
            booking_mode=(booking_mode or "QUEUE").upper(),
            slot_interval_minutes=slot_interval_minutes,
            max_per_slot=max_per_slot if max_per_slot is not None else 1,
        )
        self.db.add(new_queue)
        self.db.flush()

        if employee_id:
            self.db.query(Employee).filter(Employee.uuid == employee_id).update({"queue_id": new_queue.uuid})

        queue_services: list[QueueServiceModel] = []
        for s in services:
            cfg = service_configs.get(s.uuid)
            if not cfg:
                continue
            queue_services.append(
                QueueServiceModel(
                    service_id=s.uuid,
                    business_id=business_id,
                    queue_id=new_queue.uuid,
                    description=s.description,
                    service_fee=cfg.service_fee,
                    avg_service_time=cfg.avg_service_time,
                    status=1,
                )
            )
        self.db.add_all(queue_services)
        return new_queue

    def create_queue(self, data: QueueCreate, services: List[Service]) -> Queue:
        service_configs = {s.service_id: s for s in data.services}
        new_queue = self.create_single_queue(
            business_id=data.business_id,
            name=data.name,
            employee_id=data.employee_id,
            services=services,
            service_configs=service_configs,
            booking_mode=getattr(data, "booking_mode", None),
            slot_interval_minutes=getattr(data, "slot_interval_minutes", None),
            max_per_slot=getattr(data, "max_per_slot", None),
        )
        try:
            self.db.commit()
            return new_queue
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_queue (business_id=%s name=%s)", data.business_id, data.name)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_queues_batch(
        self,
        business_id: UUID,
        items: List[QueueCreateItem],
    ) -> List[Queue]:
        all_service_ids = list({s.service_id for item in items for s in item.services})
        services_by_id = {s.uuid: s for s in self.get_services_by_ids(all_service_ids)}

        created: List[Queue] = []
        try:
            for item in items:
                service_ids = [s.service_id for s in item.services]
                services = [services_by_id[sid] for sid in service_ids if sid in services_by_id]
                if len(services) != len(service_ids):
                    raise ValueError(f"One or more services not found for queue '{item.name}'")
                service_configs = {c.service_id: c for c in item.services}
                queue = self.create_single_queue(
                    business_id=business_id,
                    name=item.name,
                    employee_id=item.employee_id,
                    services=services,
                    service_configs=service_configs,
                    booking_mode=getattr(item, "booking_mode", None),
                    slot_interval_minutes=getattr(item, "slot_interval_minutes", None),
                    max_per_slot=getattr(item, "max_per_slot", None),
                )
                created.append(queue)
            self.db.commit()
            return created
        except HTTPException:
            raise
        except ValueError:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_queues_batch (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_services_by_ids(self, service_ids: List[UUID]) -> List[Service]:
        """Return Service models for the given UUIDs. Used by controller for response building."""
        if not service_ids:
            return []
        try:
            return self.db.query(Service).filter(Service.uuid.in_(service_ids)).all()
        except Exception:
            logger.exception("Failed to get_services_by_ids")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_queue(self, queue_id: UUID, business_id: UUID, data: QueueUpdate) -> Optional[Queue]:
        queue = self.get_queue_by_id_and_business(queue_id, business_id)
        if not queue:
            return None
        try:
            payload = data.model_dump(exclude_unset=True)
            want_employee_update = "employee_id" in payload
            employee_id = payload.pop("employee_id", None) if want_employee_update else None
            for key, val in payload.items():
                setattr(queue, key, val)
            if want_employee_update:
                self.db.query(Employee).filter(Employee.queue_id == queue_id).update({"queue_id": None})
                if employee_id:
                    self.db.query(Employee).filter(Employee.uuid == employee_id).update({"queue_id": queue_id})
            self.db.commit()
            return queue
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def add_services_to_queue(
        self, queue_id: UUID, business_id: UUID, items: List[QueueServiceAddItem]
    ) -> List[QueueServiceModel]:
        """Add one or more services to a queue. Skips service_id already in queue. Returns created queue_services."""
        queue = self.get_queue_by_id_and_business(queue_id, business_id)
        if not queue:
            return []
        existing = {
            row.service_id
            for row in self.db.query(QueueServiceModel.service_id).filter(
                QueueServiceModel.queue_id == queue_id
            ).all()
        }
        to_add = [i for i in items if i.service_id not in existing]
        if not to_add:
            return []
        try:
            created = [
                QueueServiceModel(
                    service_id=item.service_id,
                    business_id=business_id,
                    queue_id=queue_id,
                    description=item.description,
                    service_fee=item.service_fee,
                    avg_service_time=item.avg_service_time,
                    status=1,
                )
                for item in to_add
            ]
            self.db.add_all(created)
            self.db.commit()
            return created
        except Exception:
            self.db.rollback()
            logger.exception("Failed to add_services_to_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_queue_service(
        self, queue_service_id: UUID, data: QueueServiceUpdate
    ) -> Optional[QueueServiceModel]:
        qs = self.db.query(QueueServiceModel).filter(QueueServiceModel.uuid == queue_service_id).first()
        if not qs:
            return None
        try:
            payload = data.model_dump(exclude_unset=True)
            for key, val in payload.items():
                setattr(qs, key, val)
            self.db.commit()
            return qs
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_queue_service (queue_service_id=%s)", queue_service_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def delete_queue_service(self, queue_service_id: UUID) -> bool:
        qs = self.db.query(QueueServiceModel).filter(QueueServiceModel.uuid == queue_service_id).first()
        if not qs:
            return False
        try:
            self.db.delete(qs)
            self.db.commit()
            return True
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete_queue_service (queue_service_id=%s)", queue_service_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_user_by_id_with_relations(self, queue_user_id: UUID) -> Optional[QueueUser]:
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.user),
                    joinedload(QueueUser.queue),
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(QueueUser.uuid == queue_user_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_queue_user_by_id_with_relations (queue_user_id=%s)", queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_appointments_for_user(
        self, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> List[Tuple[QueueUser, Queue, Business]]:
        try:
            rows = (
                self.db.query(QueueUser, Queue, Business)
                .join(Queue, Queue.uuid == QueueUser.queue_id)
                .join(Business, Business.uuid == Queue.merchant_id)
                .options(
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(QueueUser.user_id == user_id)
                .order_by(QueueUser.queue_date.desc(), QueueUser.created_at.desc())
                .limit(limit)
                .offset(offset)
                .all()
            )
            return [(qu, q, b) for qu, q, b in rows]
        except Exception:
            logger.exception("Failed to get_appointments_for_user (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def count_appointments_for_user(self, user_id: UUID) -> int:
        try:
            return self.db.query(QueueUser).filter(QueueUser.user_id == user_id).count()
        except Exception:
            logger.exception("Failed to count_appointments_for_user (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_user_upcoming_active_appointments(
        self, user_id: UUID
    ) -> List[Tuple[QueueUser, "Queue", "Business"]]:
        """Return active (waiting/in_progress) appointments from today onwards for conflict checking."""
        today = today_app_date()
        try:
            rows = (
                self.db.query(QueueUser, Queue, Business)
                .join(Queue, Queue.uuid == QueueUser.queue_id)
                .join(Business, Business.uuid == Queue.merchant_id)
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_date >= today,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .order_by(QueueUser.queue_date.asc(), QueueUser.scheduled_start.asc())
                .all()
            )
            return [(qu, q, b) for qu, q, b in rows]
        except Exception:
            logger.exception("Failed to get_user_upcoming_active_appointments (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_booking_at_estimated_time(
        self,
        user_id: UUID,
        queue_date: date,
        appointment_time_str: str,
        tolerance_minutes: int = 30,
    ) -> Optional[QueueUser]:
        t = parse_time_string(appointment_time_str)
        if t is None:
            return None
        target_dt = datetime.combine(queue_date, t)
        window_start = target_dt - timedelta(minutes=tolerance_minutes)
        window_end = target_dt + timedelta(minutes=tolerance_minutes)
        try:
            return (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                    QueueUser.estimated_enqueue_time.isnot(None),
                    QueueUser.estimated_enqueue_time >= window_start,
                    QueueUser.estimated_enqueue_time <= window_end,
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_queue_booking_at_estimated_time (user_id=%s date=%s)", user_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_booking_at_time(
        self,
        user_id: UUID,
        queue_date: date,
        slot_start: "time",
        exclude_queue_user_id: Optional[UUID] = None,
    ) -> Optional[QueueUser]:
        try:
            q = (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.scheduled_start == slot_start,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
            )
            if exclude_queue_user_id:
                q = q.filter(QueueUser.uuid != exclude_queue_user_id)
            return q.first()
        except Exception:
            logger.exception("Failed to get_booking_at_time (user_id=%s date=%s)", user_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def expire_past_day_appointments(self, before_date: date) -> int:
        try:
            updated = (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.queue_date < before_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .update(
                    {
                        QueueUser.status: QUEUE_USER_EXPIRED,
                        QueueUser.cancellation_reason: "auto_expired",
                    },
                    synchronize_session=False,
                )
            )
            self.db.commit()
            return updated
        except Exception:
            self.db.rollback()
            logger.exception("Failed to expire_past_day_appointments (before_date=%s)", before_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_appointment_by_id_for_user(
        self, user_id: UUID, queue_user_id: UUID
    ) -> Optional[QueueUser]:
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.user),
                    joinedload(QueueUser.queue).joinedload(Queue.business),
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(
                    QueueUser.uuid == queue_user_id,
                    QueueUser.user_id == user_id,
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_appointment_by_id_for_user (user_id=%s queue_user_id=%s)", user_id, queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_services_for_booking(
        self, service_ids: List[UUID], business_id: UUID
    ) -> List[QueueServiceModel]:
        try:
            return (
                self.db.query(QueueServiceModel)
                .filter(
                    QueueServiceModel.uuid.in_(service_ids),
                    QueueServiceModel.business_id == business_id,
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_queue_services_for_booking (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_booking_services_data(
        self, queue_services: List[QueueServiceModel]
    ) -> List[dict]:
        if not queue_services:
            return []
        try:
            service_ids = [qs.service_id for qs in queue_services]
            services = self.db.query(Service).filter(Service.uuid.in_(service_ids)).all()
            by_id = {s.uuid: s for s in services}
            return [
                {
                    "uuid": str(qs.uuid),
                    "name": by_id[qs.service_id].name,
                    "price": qs.service_fee,
                    "duration": qs.avg_service_time,
                }
                for qs in queue_services
                if qs.service_id in by_id
            ]
        except Exception:
            logger.exception("Failed to get_booking_services_data")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_booking(
        self,
        user_id: UUID,
        queue_id: UUID,
        queue_date: date,
        token_number: str,
        turn_time: int,
        notes: Optional[str],
        is_scheduled: bool,
        estimated_enqueue_time: Optional[datetime],
        estimated_dequeue_time: Optional[datetime],
        queue_services: List[QueueServiceModel],
        appointment_type: Optional[str] = None,
        slot_id: Optional[UUID] = None,
        scheduled_start: Optional[time] = None,
        scheduled_end: Optional[time] = None,
    ) -> QueueUser:
        """Create a QueueUser and its QueueUserService links. Commits the transaction. Returns the created QueueUser."""
        try:
            appt_type = appointment_type or APPOINTMENT_TYPE_QUEUE
            queue_user = QueueUser(
                user_id=user_id,
                queue_id=queue_id,
                queue_date=queue_date,
                token_number=token_number,
                status=QUEUE_USER_REGISTERED,
                turn_time=turn_time,
                notes=notes,
                is_scheduled=is_scheduled,
                estimated_enqueue_time=estimated_enqueue_time,
                estimated_dequeue_time=estimated_dequeue_time,
                appointment_type=appt_type,
                slot_id=slot_id,
                scheduled_start=scheduled_start,
                scheduled_end=scheduled_end,
            )
            self.db.add(queue_user)
            self.db.flush()
            for qs in queue_services:
                self.db.add(
                    QueueUserService(
                        queue_user_id=queue_user.uuid,
                        queue_service_id=qs.uuid,
                    )
                )
            self.db.commit()
            return queue_user
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_booking (user_id=%s queue_id=%s date=%s)", user_id, queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_user_for_update(self, queue_user_id: UUID, user_id: UUID) -> Optional[QueueUser]:
        try:
            locked = (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.uuid == queue_user_id,
                    QueueUser.user_id == user_id,
                )
                .with_for_update()
                .first()
            )
            if locked is None:
                return None
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.queue).joinedload(Queue.business),
                    selectinload(QueueUser.queue_user_services)
                    .joinedload(QueueUserService.queue_service)
                    .joinedload(QueueServiceModel.service),
                )
                .filter(QueueUser.uuid == queue_user_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_queue_user_for_update (queue_user_id=%s user_id=%s)", queue_user_id, user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_appointment(
        self,
        queue_user: QueueUser,
        new_queue_id: Optional[UUID],
        new_queue_services: Optional[list],
        new_notes: Optional[str],
        queue_changed: bool,
        new_date: Optional[date] = None,
        date_changed: bool = False,
    ) -> QueueUser:
        try:
            if queue_changed and new_queue_id is not None:
                queue_user.queue_id = new_queue_id  # type: ignore[assignment]
                queue_user.reschedule_count = (queue_user.reschedule_count or 0) + 1  # type: ignore[assignment]

            if date_changed and new_date is not None:
                queue_user.queue_date = new_date  # type: ignore[assignment]
                queue_user.reschedule_count = (queue_user.reschedule_count or 0) + 1  # type: ignore[assignment]

            if new_notes is not None:
                queue_user.notes = new_notes  # type: ignore[assignment]

            if new_queue_services is not None:
                self.db.query(QueueUserService).filter(
                    QueueUserService.queue_user_id == queue_user.uuid
                ).delete(synchronize_session=False)
                for qs in new_queue_services:
                    self.db.add(QueueUserService(
                        queue_user_id=queue_user.uuid,
                        queue_service_id=qs.uuid,
                    ))
                queue_user.turn_time = sum((qs.avg_service_time or 5) for qs in new_queue_services)  # type: ignore[assignment]

            self.db.commit()
            self.db.refresh(queue_user)
            return queue_user
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_appointment (queue_user_id=%s)", queue_user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def count_active_users_in_queue(self, queue_id: UUID, queue_date: date) -> int:
        try:
            return (
                self.db.query(func.count(QueueUser.uuid))
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .scalar() or 0
            )
        except Exception:
            logger.exception("Failed to count_active_users_in_queue (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def cancel_appointment(self, queue_user: QueueUser, reason: str = "customer_cancelled") -> QueueUser:
        try:
            queue_user.status = QUEUE_USER_CANCELLED  # type: ignore[assignment]
            queue_user.cancellation_reason = reason  # type: ignore[assignment]
            self.db.commit()
            self.db.refresh(queue_user)
            return queue_user
        except Exception:
            self.db.rollback()
            logger.exception("Failed to cancel_appointment (queue_user_id=%s)", queue_user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_registered_queue_users_for_serving(
        self, queue_id: UUID, queue_date: date
    ) -> List[QueueUser]:
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.user),
                    joinedload(QueueUser.slot),
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status == QUEUE_USER_REGISTERED,
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_registered_queue_users_for_serving (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queues_by_business_id(self, business_id: UUID) -> List[Queue]:
        try:
            return (
                self.db.query(Queue)
                .filter(Queue.merchant_id == business_id)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_queues_by_business_id (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_by_id(self, queue_id: UUID) -> Optional[Queue]:
        try:
            return self.db.query(Queue).filter(Queue.uuid == queue_id).first()
        except Exception:
            logger.exception("Failed to get_queue_by_id (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_by_id_with_employees(self, queue_id: UUID) -> Optional[Queue]:
        try:
            return (
                self.db.query(Queue)
                .options(joinedload(Queue.employees))
                .filter(Queue.uuid == queue_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_queue_by_id_with_employees (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_services_with_service(self, queue_id: UUID) -> List[Tuple[QueueServiceModel, Service]]:
        try:
            return (
                self.db.query(QueueServiceModel, Service)
                .join(Service, QueueServiceModel.service_id == Service.uuid)
                .filter(QueueServiceModel.queue_id == queue_id)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_queue_services_with_service (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_by_id_and_business(
        self, queue_id: UUID, business_id: UUID
    ) -> Optional[Queue]:
        try:
            return (
                self.db.query(Queue)
                .filter(Queue.uuid == queue_id, Queue.merchant_id == business_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_queue_by_id_and_business (queue_id=%s business_id=%s)", queue_id, business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_min_slot_duration_minutes(self, queue_id: UUID) -> int:
        try:
            rows = (
                self.db.query(QueueServiceModel.avg_service_time)
                .filter(
                    QueueServiceModel.queue_id == queue_id,
                    QueueServiceModel.avg_service_time.isnot(None),
                )
                .all()
            )
            values = [r[0] for r in rows if r[0] is not None and r[0] > 0]
            if not values:
                return DEFAULT_SLOT_MINUTES
            minutes = int(min(values))
            return max(SLOT_DURATION_FLOOR, min(SLOT_DURATION_CEILING, minutes))
        except SQLAlchemyError:
            logger.warning("get_queue_min_slot_duration_minutes failed (queue_id=%s), using default", queue_id)
            return DEFAULT_SLOT_MINUTES

    def reserve_slot_atomic(self, slot_id: UUID) -> Optional[AppointmentSlot]:
        try:
            slot = (
                self.db.query(AppointmentSlot)
                .filter(AppointmentSlot.uuid == slot_id)
                .with_for_update()
                .first()
            )
            if not slot or slot.is_blocked or slot.booked_count >= slot.capacity:  # type: ignore[operator]
                return None
            slot.booked_count += 1  # type: ignore[assignment]
            self.db.flush()
            return slot
        except Exception:
            self.db.rollback()
            logger.exception("Failed to reserve_slot_atomic (slot_id=%s)", slot_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def release_slot(self, slot_id: UUID) -> None:
        try:
            slot = self.db.query(AppointmentSlot).filter(AppointmentSlot.uuid == slot_id).first()
            if slot and slot.booked_count > 0:  # type: ignore[operator]
                slot.booked_count -= 1  # type: ignore[assignment]
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to release_slot (slot_id=%s)", slot_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_slot_by_id(self, slot_id: UUID) -> Optional[AppointmentSlot]:
        try:
            return self.db.query(AppointmentSlot).filter(AppointmentSlot.uuid == slot_id).first()
        except Exception:
            logger.exception("Failed to get_slot_by_id (slot_id=%s)", slot_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_active_scheduled_bookings_for_date(
        self, queue_id: UUID, queue_date: date
    ) -> List[QueueUser]:
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service),
                )
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.appointment_type.in_([APPOINTMENT_TYPE_FIXED, APPOINTMENT_TYPE_APPROXIMATE]),
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                    QueueUser.scheduled_start.isnot(None),
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_active_scheduled_bookings_for_date (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queues_offering_service_ids(
        self, business_id: UUID, queue_service_ids: List[UUID]
    ) -> List[Queue]:
        if not queue_service_ids:
            return []
        try:
            return (
                self.db.query(Queue)
                .options(joinedload(Queue.employees))
                .join(QueueServiceModel, QueueServiceModel.queue_id == Queue.uuid)
                .filter(
                    Queue.merchant_id == business_id,
                    QueueServiceModel.uuid.in_(queue_service_ids),
                )
                .distinct()
                .all()
            )
        except Exception:
            logger.exception("Failed to get_queues_offering_service_ids (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_service_details_for_ids(
        self, queue_service_ids: List[UUID]
    ) -> List[dict]:
        if not queue_service_ids:
            return []
        try:
            rows = (
                self.db.query(QueueServiceModel, Service)
                .join(Service, Service.uuid == QueueServiceModel.service_id)
                .filter(QueueServiceModel.uuid.in_(queue_service_ids))
                .all()
            )
            return [
                {
                    "queue_id": qs.queue_id,
                    "queue_service_uuid": str(qs.uuid),
                    "service_uuid": str(svc.uuid),
                    "service_name": svc.name,
                    "price": qs.service_fee,
                    "duration": qs.avg_service_time,
                }
                for qs, svc in rows
            ]
        except Exception:
            logger.exception("Failed to get_queue_service_details_for_ids")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_to_service_ids(self, queue_ids: List[UUID]) -> Dict[UUID, List[UUID]]:
        if not queue_ids:
            return {}
        try:
            rows = (
                self.db.query(QueueServiceModel.queue_id, QueueServiceModel.service_id)
                .filter(QueueServiceModel.queue_id.in_(queue_ids))
                .all()
            )
            result: Dict[UUID, List[UUID]] = defaultdict(list)
            for qid, sid in rows:
                result[qid].append(sid)
            return dict(result)
        except Exception:
            logger.exception("Failed to get_queue_to_service_ids")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_today_active_queue_user_rows(
        self, queue_ids: List[UUID], booking_date: date
    ) -> List[dict]:
        if not queue_ids:
            return []
        try:
            rows = (
                self.db.query(
                    QueueUser.queue_id,
                    QueueUser.status,
                    QueueUser.turn_time,
                    QueueUser.enqueue_time,
                )
                .filter(
                    QueueUser.queue_id.in_(queue_ids),
                    QueueUser.queue_date == booking_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .all()
            )
            return [
                {
                    "queue_id": row.queue_id,
                    "status": row.status,
                    "turn_time": row.turn_time,
                    "enqueue_time": row.enqueue_time,
                }
                for row in rows
            ]
        except Exception:
            logger.exception("Failed to get_today_active_queue_user_rows (date=%s)", booking_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_future_date_counts_batch(
        self, queue_ids: List[UUID], booking_date: date
    ) -> Dict[UUID, int]:
        if not queue_ids:
            return {}
        try:
            rows = (
                self.db.query(QueueUser.queue_id, func.count(QueueUser.uuid).label("cnt"))
                .filter(
                    QueueUser.queue_id.in_(queue_ids),
                    QueueUser.queue_date == booking_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .group_by(QueueUser.queue_id)
                .all()
            )
            return {row.queue_id: row.cnt for row in rows}
        except Exception:
            logger.exception("Failed to get_future_date_counts_batch (date=%s)", booking_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_historical_percentile_wait_batch(
        self,
        queue_ids: List[UUID],
        reference_date: date,
        percentile: float,
        default_minutes: float,
    ) -> Dict[UUID, float]:
        if not queue_ids:
            return {}
        try:
            day_of_week = reference_date.weekday()
            four_weeks_ago = reference_date - timedelta(days=28)
            rows = (
                self.db.query(
                    QueueUser.queue_id,
                    (func.extract("epoch", QueueUser.dequeue_time - QueueUser.enqueue_time) / 60).label("wait_minutes"),
                )
                .filter(
                    QueueUser.queue_id.in_(queue_ids),
                    extract("dow", QueueUser.queue_date) == (day_of_week + 1) % 7,
                    QueueUser.queue_date >= four_weeks_ago,
                    QueueUser.queue_date < reference_date,
                    QueueUser.status == QUEUE_USER_COMPLETED,
                    QueueUser.enqueue_time.isnot(None),
                    QueueUser.dequeue_time.isnot(None),
                )
                .all()
            )
            by_queue: Dict[UUID, List[float]] = defaultdict(list)
            for row in rows:
                if row.wait_minutes and row.wait_minutes > 0:
                    by_queue[row.queue_id].append(float(row.wait_minutes))
            result: Dict[UUID, float] = {qid: default_minutes for qid in queue_ids}
            for qid, times in by_queue.items():
                times.sort()
                index = int(len(times) * percentile)
                result[qid] = times[min(index, len(times) - 1)]
            return result
        except Exception:
            logger.exception("Failed to get_historical_percentile_wait_batch (date=%s)", reference_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_historical_percentile_wait_single(
        self,
        queue_id: UUID,
        reference_date: date,
        percentile: float,
        default_minutes: float,
    ) -> float:
        result = self.get_historical_percentile_wait_batch(
            [queue_id], reference_date, percentile, default_minutes
        )
        return result.get(queue_id, default_minutes)

    def get_queue_user_ahead_metrics(
        self,
        queue_id: UUID,
        queue_date: date,
        enqueue_time: Optional[datetime],
        created_at: Optional[datetime],
        exclude_queue_user_id: UUID,
    ) -> Dict[str, Any]:
        if enqueue_time is not None:
            order_ahead = (QueueUser.enqueue_time.isnot(None)) & (QueueUser.enqueue_time < enqueue_time)
        else:
            order_ahead = or_(
                QueueUser.enqueue_time.isnot(None),
                (QueueUser.enqueue_time.is_(None) & (QueueUser.created_at < created_at)),
            )
        try:
            ahead_count = (
                self.db.query(func.count(QueueUser.uuid))
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                    QueueUser.uuid != exclude_queue_user_id,
                    order_ahead,
                )
                .scalar() or 0
            )
            total_wait = (
                self.db.query(func.coalesce(func.sum(QueueUser.turn_time), 0))
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                    QueueUser.uuid != exclude_queue_user_id,
                    order_ahead,
                )
                .scalar() or 0
            )
            return {"ahead_count": ahead_count, "total_wait_minutes": int(total_wait)}
        except Exception:
            logger.exception("Failed to get_queue_user_ahead_metrics (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_existing_same_day_booking(
        self, user_id: UUID, queue_id: UUID, queue_date: date
    ) -> Optional[QueueUser]:
        """Return existing queue user if already in this queue for this date (registered or in-progress)."""
        try:
            return (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_existing_same_day_booking (user_id=%s queue_id=%s)", user_id, queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_today_active_appointment_for_user(
        self, user_id: UUID, today: date
    ) -> Optional[QueueUser]:
        """Return latest active (waiting or in_progress) queue user for this user and date, or None."""
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.queue).joinedload(Queue.business),
                    joinedload(QueueUser.queue).joinedload(Queue.employees),
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_date == today,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .order_by(QueueUser.created_at.desc())
                .first()
            )
        except Exception:
            logger.exception("Failed to get_today_active_appointment_for_user (user_id=%s date=%s)", user_id, today)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_today_active_appointments_for_user(
        self, user_id: UUID, today: date
    ) -> List[QueueUser]:
        """Return all active (waiting or in_progress) queue users for this user and date, newest first."""
        try:
            return (
                self.db.query(QueueUser)
                .options(
                    joinedload(QueueUser.queue).joinedload(Queue.business),
                    joinedload(QueueUser.queue).joinedload(Queue.employees),
                    selectinload(QueueUser.queue_user_services).joinedload(QueueUserService.queue_service).joinedload(QueueServiceModel.service),
                )
                .filter(
                    QueueUser.user_id == user_id,
                    QueueUser.queue_date == today,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .order_by(QueueUser.created_at.desc())
                .all()
            )
        except Exception:
            logger.exception("Failed to get_today_active_appointments_for_user (user_id=%s date=%s)", user_id, today)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_user_ids_in_queue_for_date(
        self, queue_id: UUID, queue_date: date
    ) -> List[UUID]:
        """Return user_ids of users with active appointment in this queue on this date."""
        try:
            rows = (
                self.db.query(QueueUser.user_id)
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .distinct()
                .all()
            )
            return [r[0] for r in rows]
        except Exception:
            logger.exception("Failed to get_user_ids_in_queue_for_date (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_live_queue_users_raw(
        self, queue_id: UUID, queue_date: date
    ) -> Tuple[List[Tuple[QueueUser, User]], Dict[UUID, List[str]]]:
        try:
            rows = (
                self.db.query(QueueUser, User)
                .join(User, User.uuid == QueueUser.user_id)
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                )
                .all()
            )
            if not rows:
                return [], {}

            queue_user_ids = [qu.uuid for qu, _ in rows]
            svc_rows = (
                self.db.query(QueueUserService.queue_user_id, Service.name)
                .join(QueueServiceModel, QueueServiceModel.uuid == QueueUserService.queue_service_id)
                .join(Service, Service.uuid == QueueServiceModel.service_id)
                .filter(QueueUserService.queue_user_id.in_(queue_user_ids))
                .all()
            )
            svc_by_user: Dict[UUID, List[str]] = defaultdict(list)
            for uid, name in svc_rows:
                svc_by_user[uid].append(name)
            return rows, dict(svc_by_user)
        except Exception:
            logger.exception("Failed to get_live_queue_users_raw (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_active_queue_users_with_lock(
        self, queue_id: UUID, queue_date: date
    ) -> List[QueueUser]:
        try:
            return (
                self.db.query(QueueUser)
                .filter(
                    QueueUser.queue_id == queue_id,
                    QueueUser.queue_date == queue_date,
                    QueueUser.status.in_([QUEUE_USER_IN_PROGRESS, QUEUE_USER_REGISTERED]),
                )
                .with_for_update()
                .order_by(
                    QueueUser.enqueue_time.asc().nullslast(),
                    QueueUser.created_at.asc(),
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_active_queue_users_with_lock (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def mark_queue_user_completed(
        self, queue_user_id: UUID, dequeue_time: datetime
    ) -> None:
        try:
            self.db.query(QueueUser).filter(QueueUser.uuid == queue_user_id).update(
                {
                    QueueUser.status: QUEUE_USER_COMPLETED,
                    QueueUser.dequeue_time: dequeue_time,
                },
                synchronize_session=False,
            )
            self.db.flush()
        except Exception:
            logger.exception("Failed to mark_queue_user_completed (queue_user_id=%s)", queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def mark_queue_user_in_progress(
        self, queue_user_id: UUID, enqueue_time: datetime
    ) -> None:
        try:
            self.db.query(QueueUser).filter(QueueUser.uuid == queue_user_id).update(
                {
                    QueueUser.status: QUEUE_USER_IN_PROGRESS,
                    QueueUser.enqueue_time: enqueue_time,
                },
                synchronize_session=False,
            )
            self.db.flush()
        except Exception:
            logger.exception("Failed to mark_queue_user_in_progress (queue_user_id=%s)", queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def add_delay_to_later_approx_bookings(
        self,
        queue_id: UUID,
        queue_date: date,
        after_enqueue_time: Optional[datetime],
        after_created_at: Optional[datetime],
        exclude_queue_user_id: UUID,
        delay_minutes: int,
    ) -> None:
        if delay_minutes <= 0:
            return
        order_after = None
        if after_enqueue_time is not None:
            order_after = QueueUser.enqueue_time > after_enqueue_time
        elif after_created_at is not None:
            order_after = QueueUser.created_at > after_created_at
        filters = [
            QueueUser.queue_id == queue_id,
            QueueUser.queue_date == queue_date,
            QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
            QueueUser.appointment_type == APPOINTMENT_TYPE_APPROXIMATE,
            QueueUser.uuid != exclude_queue_user_id,
        ]
        if order_after is not None:
            filters.append(order_after)
        try:
            self.db.query(QueueUser).filter(*filters).update(
                {QueueUser.delay_minutes: QueueUser.delay_minutes + delay_minutes},
                synchronize_session=False,
            )
            self.db.flush()
        except Exception:
            logger.exception("Failed to add_delay_to_later_approx_bookings (queue_id=%s date=%s)", queue_id, queue_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def commit_advance(self) -> None:
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to commit_advance")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def set_queue_status(self, queue_id: UUID, status: int) -> Optional[Queue]:
        try:
            queue = self.db.query(Queue).filter(Queue.uuid == queue_id).first()
            if not queue:
                return None
            queue.status = status  # type: ignore[assignment]
            self.db.commit()
            return queue
        except Exception:
            self.db.rollback()
            logger.exception("Failed to set_queue_status (queue_id=%s status=%s)", queue_id, status)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queues(self, business_id: UUID):  # type: ignore
        try:
            emp_subq = (
                select(
                    func.coalesce(
                        func.json_agg(
                            func.json_build_object("uuid", Employee.uuid, "name", Employee.full_name)
                        ),
                        "[]",
                    )
                )
                .select_from(Employee)
                .where(Employee.queue_id == Queue.uuid)
                .correlate(Queue)
                .scalar_subquery()
            )
            svc_subq = (
                select(
                    func.coalesce(
                        func.json_agg(func.json_build_object("uuid", QueueServiceModel.uuid)),
                        "[]",
                    )
                )
                .select_from(QueueServiceModel)
                .where(QueueServiceModel.queue_id == Queue.uuid)
                .correlate(Queue)
                .scalar_subquery()
            )
            user_count_subq = (
                select(func.count(func.distinct(QueueUser.user_id)))
                .select_from(QueueUser)
                .where(QueueUser.queue_id == Queue.uuid)
                .correlate(Queue)
                .scalar_subquery()
            )
            result = (
                self.db.query(
                    Queue.uuid,
                    Queue.merchant_id,
                    Queue.name,
                    Queue.status,
                    Queue.is_counter,
                    Queue.limit,
                    Queue.created_at,
                    emp_subq.label("employees"),
                    svc_subq.label("services"),
                    user_count_subq.label("unique_users"),
                )
                .filter(Queue.merchant_id == business_id)
                .all()
            )
            return result
        except Exception:
            logger.exception("Failed to get_queues (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_business_services(self, business_id: UUID, service_ids: Optional[List[UUID]] = None) -> List[Tuple[QueueServiceModel, Service]]:  # type: ignore
        try:
            result = (
                self.db.query(QueueServiceModel, Service)
                .join(Service, QueueServiceModel.service_id == Service.uuid)
                .filter(QueueServiceModel.business_id == business_id)
                .all()
            )
            return cast(List[Tuple[QueueServiceModel, Service]], result)
        except Exception:
            logger.exception("Failed to get_business_services (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_businesses_services(self, business_ids: List[UUID]) -> dict[UUID, List[Tuple[QueueServiceModel, Service]]]:  # type: ignore
        try:
            if not business_ids:
                return {}

            result = (
                self.db.query(QueueServiceModel, Service)
                .join(Service, QueueServiceModel.service_id == Service.uuid)
                .filter(QueueServiceModel.business_id.in_(business_ids))
                .all()
            )

            services_by_business: dict[UUID, List[Tuple[QueueServiceModel, Service]]] = {}
            for queue_service, service in result:
                business_id = queue_service.business_id
                if business_id not in services_by_business:
                    services_by_business[business_id] = []
                services_by_business[business_id].append((queue_service, service))

            return services_by_business
        except Exception:
            logger.exception("Failed to get_businesses_services")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_queue_users(
        self,
        *,
        business_id: UUID | None,
        queue_id: UUID | None,
        employee_id: UUID | None,
        page: int,
        limit: int,
        search: str | None,
    ) -> list[tuple[QueueUser, User]]:
        try:
            query = (
                self.db.query(QueueUser, User)
                .join(User, User.uuid == QueueUser.user_id)
                .join(Queue, Queue.uuid == QueueUser.queue_id)
            )

            if business_id is not None:
                query = query.filter(Queue.merchant_id == business_id)

            if queue_id is not None:
                query = query.filter(QueueUser.queue_id == queue_id)

            if employee_id is not None:
                query = query.join(Employee, Employee.queue_id == QueueUser.queue_id).filter(Employee.uuid == employee_id)

            if search:
                search_text = f"%{search}%"
                query = query.filter(
                    (User.full_name.ilike(search_text))
                    | (User.email.ilike(search_text))
                    | (User.phone_number.ilike(search_text))
                    | (QueueUser.token_number.ilike(search_text))
                )

            offset = (page - 1) * limit
            query = query.order_by(QueueUser.enqueue_time.desc().nullslast())
            result = query.offset(offset).limit(limit).all()
            return cast(list[tuple[QueueUser, User]], result)
        except Exception:
            logger.exception("Failed to get_queue_users (business_id=%s page=%s)", business_id, page)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
