from sqlalchemy import func, extract, case, or_
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Tuple, Dict, cast, Optional, Any, TYPE_CHECKING
from collections import defaultdict
from uuid import UUID
from datetime import datetime, date, timedelta

from app.models.queue import Queue, QueueService as QueueServiceModel, QueueUser, QueueUserService
from app.models.service import Service
from app.models.employee import Employee
from app.models.user import User
from app.models.business import Business
from app.schemas.queue import QueueCreate
from app.core.constants import (
    QUEUE_USER_REGISTERED,
    QUEUE_USER_IN_PROGRESS,
    QUEUE_USER_COMPLETED,
)

if TYPE_CHECKING:
    from app.services.booking_calculation_service import BookingCalculationService


class QueueService:
    def __init__(self, db: Session):
        self.db = db

    def create_queue(self, data: QueueCreate, services: List[Service]) -> Queue:
        try:
            service_configs = {s.service_id: s for s in data.services}
            new_queue = Queue(merchant_id=data.business_id, name=data.name, status=1)
            self.db.add(new_queue)
            self.db.flush()

            if data.employee_id:
                self.db.query(Employee).filter(Employee.uuid == data.employee_id).update({"queue_id": new_queue.uuid})

            queue_services: list[QueueServiceModel] = []
            for s in services:
                cfg = service_configs.get(s.uuid)  # type: ignore
                if not cfg:
                    continue

                queue_services.append(
                    QueueServiceModel(
                        service_id=s.uuid,
                        business_id=data.business_id,
                        queue_id=new_queue.uuid,
                        description=s.description,
                        service_fee=cfg.service_fee,
                        avg_service_time=cfg.avg_service_time,
                        status=1,
                    )
                )

            self.db.add_all(queue_services)
            self.db.commit()
            self.db.refresh(new_queue)
            return new_queue

        except SQLAlchemyError:
            self.db.rollback()
            raise
        except Exception:
            self.db.rollback()
            raise

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
        except SQLAlchemyError:
            raise

    def get_queue_services_for_booking(
        self, service_ids: List[UUID], business_id: UUID
    ) -> List[QueueServiceModel]:
        """Return QueueService records for the given service_ids and business_id (for booking validation)."""
        try:
            return (
                self.db.query(QueueServiceModel)
                .filter(
                    QueueServiceModel.uuid.in_(service_ids),
                    QueueServiceModel.business_id == business_id,
                )
                .all()
            )
        except SQLAlchemyError:
            raise

    def get_booking_services_data(
        self, queue_services: List[QueueServiceModel]
    ) -> List[dict]:
        """Build booking services payload from queue_services with a single batch load of Service (no query in loop)."""
        if not queue_services:
            return []
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

    def get_queues_by_business_id(self, business_id: UUID) -> List[Queue]:
        """Return all Queue models for a business (for realtime/aggregation use)."""
        try:
            return (
                self.db.query(Queue)
                .filter(Queue.merchant_id == business_id)
                .all()
            )
        except SQLAlchemyError:
            raise

    def get_queue_by_id(self, queue_id: UUID) -> Optional[Queue]:
        """Return a Queue by id, or None."""
        try:
            return self.db.query(Queue).filter(Queue.uuid == queue_id).first()
        except SQLAlchemyError:
            raise

    def get_queue_by_id_and_business(
        self, queue_id: UUID, business_id: UUID
    ) -> Optional[Queue]:
        """Return a Queue by id and business_id (for validation), or None."""
        try:
            return (
                self.db.query(Queue)
                .filter(Queue.uuid == queue_id, Queue.merchant_id == business_id)
                .first()
            )
        except SQLAlchemyError:
            raise

    def get_queues_offering_service_ids(
        self, business_id: UUID, queue_service_ids: List[UUID]
    ) -> List[Queue]:
        """Return queues that offer the given queue service IDs (for booking metrics)."""
        if not queue_service_ids:
            return []
        try:
            return (
                self.db.query(Queue)
                .join(QueueServiceModel, QueueServiceModel.queue_id == Queue.uuid)
                .filter(
                    Queue.merchant_id == business_id,
                    QueueServiceModel.uuid.in_(queue_service_ids),
                )
                .distinct()
                .all()
            )
        except SQLAlchemyError:
            raise

    def get_queue_to_service_ids(self, queue_ids: List[UUID]) -> Dict[UUID, List[UUID]]:
        """Return mapping queue_id -> list of service_id for the given queues (one query)."""
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
        except SQLAlchemyError:
            raise

    def get_today_queue_metrics_batch(
        self, queue_ids: List[UUID], booking_date: date
    ) -> Dict[UUID, Dict[str, Any]]:
        """Per-queue: registered count, in-progress count, sum of turn_time (one query)."""
        if not queue_ids:
            return {}
        try:
            rows = (
                self.db.query(
                    QueueUser.queue_id,
                    func.count(case((QueueUser.status == QUEUE_USER_REGISTERED, 1))).label("registered_count"),
                    func.count(case((QueueUser.status == QUEUE_USER_IN_PROGRESS, 1))).label("in_progress_count"),
                    func.coalesce(func.sum(QueueUser.turn_time), 0).label("total_wait_minutes"),
                )
                .filter(
                    QueueUser.queue_id.in_(queue_ids),
                    QueueUser.queue_date == booking_date,
                    QueueUser.status.in_([QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS]),
                )
                .group_by(QueueUser.queue_id)
                .all()
            )
            result: Dict[UUID, Dict[str, Any]] = {
                qid: {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0}
                for qid in queue_ids
            }
            for row in rows:
                result[row.queue_id] = {
                    "registered_count": row.registered_count or 0,
                    "in_progress_count": row.in_progress_count or 0,
                    "total_wait_minutes": int(row.total_wait_minutes or 0),
                }
            return result
        except SQLAlchemyError:
            raise

    def get_future_date_counts_batch(
        self, queue_ids: List[UUID], booking_date: date
    ) -> Dict[UUID, int]:
        """Per-queue count of scheduled bookings for the date (one query)."""
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
        except SQLAlchemyError:
            raise

    def get_historical_percentile_wait_batch(
        self,
        queue_ids: List[UUID],
        reference_date: date,
        percentile: float,
        default_minutes: float,
    ) -> Dict[UUID, float]:
        """Historical wait times (same day-of-week, past 4 weeks); percentile per queue (one query)."""
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
        except SQLAlchemyError:
            raise

    def get_historical_percentile_wait_single(
        self,
        queue_id: UUID,
        reference_date: date,
        percentile: float,
        default_minutes: float,
    ) -> float:
        """Historical percentile wait for one queue (same day-of-week, past 4 weeks)."""
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
        """Count and sum turn_time of users ahead of this one (same queue/date, ordered before)."""
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
        except SQLAlchemyError:
            raise

    def get_existing_same_day_booking(
        self, user_id: UUID, queue_id: UUID, queue_date
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
        except SQLAlchemyError:
            raise

    def get_queues(self, business_id: UUID):  # type: ignore
        try:
            result = (
                self.db.query(
                    Queue.uuid.label("queue_id"),
                    Queue.name.label("queue_name"),
                    Queue.status.label("status"),
                    func.json_agg(
                        func.distinct(
                            func.json_build_object(
                                "uuid", Employee.uuid,
                                "name", Employee.full_name,
                            )
                        )
                    ).filter(Employee.uuid.isnot(None)).label("employees"),
                    func.json_agg(
                        func.distinct(
                            func.json_build_object(
                                "uuid", QueueServiceModel.uuid
                            )
                        )
                    ).filter(QueueServiceModel.uuid.isnot(None)).label("services"),
                    func.count(func.distinct(QueueUser.user_id)).label("unique_users"),
                )
                .outerjoin(Employee, Employee.queue_id == Queue.uuid)
                .outerjoin(QueueServiceModel, QueueServiceModel.queue_id == Queue.uuid)
                .outerjoin(QueueUser, QueueUser.queue_id == Queue.uuid)
                .filter(Queue.merchant_id == business_id)
                .group_by(Queue.uuid, Queue.name, Queue.status)
                .all()
            )
            return result
        except SQLAlchemyError:
            raise
        except Exception:
            raise

    def get_business_services(self, business_id: UUID, service_ids: Optional[List[UUID]] = None) -> List[Tuple[QueueServiceModel, Service]]:  # type: ignore
        try:
            result = (
                self.db.query(QueueServiceModel, Service)
                .join(Service, QueueServiceModel.service_id == Service.uuid)
                .filter(QueueServiceModel.business_id == business_id)
                .all()
            )
            return cast(List[Tuple[QueueServiceModel, Service]], result)
        except SQLAlchemyError:
            raise
        except Exception:
            raise

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
        except SQLAlchemyError:
            raise
        except Exception:
            raise

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

        except SQLAlchemyError:
            raise
        except Exception:
            raise

    def get_existing_booking_response_payload(
        self,
        user_id: UUID,
        queue_id: UUID,
        queue_date: Any,
        business_id: UUID,
        booking_calc_service: "BookingCalculationService",
    ) -> Optional[dict]:
        """
        If the user is already in this queue for this date, return a dict suitable for
        BookingData(already_in_queue=True). All DB access and payload construction is done here.
        Returns None if no existing same-day booking.
        """
        existing = self.get_existing_same_day_booking(user_id, queue_id, queue_date)
        if not existing:
            return None

        existing_with_relations = self.get_queue_user_by_id_with_relations(existing.uuid) or existing
        metrics = booking_calc_service.get_existing_queue_user_metrics(existing_with_relations)

        queue = self.get_queue_by_id(queue_id)
        business = self.db.query(Business).filter(Business.uuid == business_id).first()
        if not queue or not business:
            return None

        services_data: List[dict] = []
        for qus in existing_with_relations.queue_user_services or []:
            qs = getattr(qus, "queue_service", None)
            if qs and getattr(qs, "service", None):
                s = qs.service
                services_data.append({
                    "uuid": str(qs.uuid),
                    "name": s.name,
                    "price": getattr(qs, "service_fee", None),
                    "duration": getattr(qs, "avg_service_time", None),
                })

        return {
            "uuid": str(existing_with_relations.uuid),
            "token_number": existing_with_relations.token_number or "",
            "queue_id": str(queue_id),
            "queue_name": queue.name,
            "business_id": str(business_id),
            "business_name": business.name,
            "queue_date": queue_date,
            "position": metrics["position"],
            "estimated_wait_minutes": metrics["wait_minutes"],
            "estimated_wait_range": metrics["wait_range"],
            "estimated_appointment_time": metrics["appointment_time"],
            "services": services_data,
            "status": "confirmed",
            "created_at": existing_with_relations.created_at or datetime.now(),
            "already_in_queue": True,
        }


