from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional
from datetime import date, datetime

from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.realtime.queue_manager import queue_manager
from app.schemas.queue import (
    QueueCreate, QueueData, QueueUserData,
    AvailableSlotData, BookingCreateInput, BookingData, BookingServiceData
)
from app.schemas.user import UserData
from app.schemas.service import ServiceData
from app.models.service import Service
from app.models.queue import Queue, QueueService as QueueServiceModel, QueueUser, QueueUserService
from app.models.business import Business
from app.core.constants import BUSINESS_REGISTERED, QUEUE_USER_REGISTERED


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

    # ─────────────────────────────────────────────────────────────────────────
    # Customer Booking APIs
    # ─────────────────────────────────────────────────────────────────────────

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
            
            business = self.db.query(Business).filter(Business.uuid == data.business_id).first()
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            
            queue = self.db.query(Queue).filter(
                Queue.uuid == data.queue_id,
                Queue.merchant_id == data.business_id
            ).first()
            if not queue:
                raise HTTPException(status_code=404, detail="Queue not found")
            
            queue_services = self.db.query(QueueServiceModel).filter(
                QueueServiceModel.uuid.in_(data.service_ids),
                QueueServiceModel.business_id == data.business_id
            ).all()
            if not queue_services:
                raise HTTPException(status_code=400, detail="No valid services selected")
            
            total_service_time = sum(
                (qs.avg_service_time or 5) for qs in queue_services
            )
            
            date_str = data.queue_date.strftime("%Y-%m-%d")
            token_number = await queue_manager.generate_token_number(str(data.queue_id), date_str)
            
            queue_user = QueueUser(
                user_id=user_id,
                queue_id=data.queue_id,
                queue_date=data.queue_date,
                token_number=token_number,
                status=QUEUE_USER_REGISTERED,
                turn_time=total_service_time,
                notes=data.notes,
                is_scheduled=False
            )
            self.db.add(queue_user)
            self.db.flush()
            
            for qs in queue_services:
                queue_user_service = QueueUserService(
                    queue_user_id=queue_user.uuid,
                    queue_service_id=qs.uuid
                )
                self.db.add(queue_user_service)
            
            self.db.commit()
            self.db.refresh(queue_user)
            
            result = await queue_manager.add_to_queue(
                db=self.db,
                queue_id=str(data.queue_id),
                user_id=str(user_id),
                date_str=date_str,
                token_number=token_number,
                total_service_time=total_service_time,
                business_id=str(data.business_id)
            )
            
            services_data = []
            for qs in queue_services:
                service = self.db.query(Service).filter(Service.uuid == qs.service_id).first()
                if service:
                    services_data.append(BookingServiceData(
                        uuid=str(qs.uuid),
                        name=service.name,
                        price=qs.service_fee,
                        duration=qs.avg_service_time
                    ))
            
            return BookingData(
                uuid=str(queue_user.uuid),
                token_number=token_number,
                queue_id=str(data.queue_id),
                queue_name=queue.name,
                business_id=str(data.business_id),
                business_name=business.name,
                queue_date=data.queue_date,
                position=result.get("position", 0),
                estimated_wait_minutes=result.get("estimated_wait_minutes", 0),
                estimated_appointment_time=datetime.now().strftime("%H:%M"),
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


