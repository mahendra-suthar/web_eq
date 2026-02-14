from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.exc import SQLAlchemyError
from typing import List, Tuple, cast, Optional
from uuid import UUID

from app.models.queue import Queue, QueueService as QueueServiceModel, QueueUser, QueueUserService
from app.models.service import Service
from app.models.employee import Employee
from app.models.user import User
from app.schemas.queue import QueueCreate


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


