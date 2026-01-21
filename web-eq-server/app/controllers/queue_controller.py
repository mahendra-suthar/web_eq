from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List

from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.schemas.queue import QueueCreate, QueueData, QueueUserData
from app.schemas.user import UserData
from app.schemas.service import ServiceData
from app.models.service import Service
from app.core.constants import BUSINESS_REGISTERED


class QueueController:
    def __init__(self, db: Session):
        self.db = db
        self.queue_service = QueueService(db)
        self.business_service = BusinessService(db)

    async def create_queue(self, data: QueueCreate) -> QueueData:
        try:
            service_ids = [s.service_id for s in data.services]
            services = self.db.query(Service).filter(Service.uuid.in_(service_ids)).all()
            if not services:
                raise HTTPException(400, "No valid services selected")

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


