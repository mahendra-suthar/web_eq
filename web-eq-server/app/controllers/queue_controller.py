from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional
from datetime import date, datetime, time, timedelta

from app.services.queue_service import QueueService
from app.services.business_service import BusinessService
from app.services.realtime.queue_manager import queue_manager
from app.schemas.queue import (
    QueueCreate, QueueData, QueueUserData, QueueUserDetailResponse, QueueUserDetailUserInfo,
    AvailableSlotData, BookingCreateInput, BookingData, BookingServiceData, BookingPreviewData
)
from app.schemas.user import UserData
from app.schemas.service import ServiceData
from app.models.service import Service
from app.models.queue import QueueService as QueueServiceModel, QueueUser, QueueUserService
from app.models.business import Business
from app.models.employee import Employee
from app.core.constants import BUSINESS_REGISTERED, QUEUE_USER_REGISTERED
from app.services.booking_calculation_service import BookingCalculationService


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
                # Validate provided queue
                queue = self.queue_service.get_queue_by_id_and_business(
                    data.queue_id, data.business_id
                )
                if not queue:
                    raise HTTPException(status_code=404, detail="Queue not found")
                queue_id = data.queue_id
                
                # Calculate metrics for selected queue
                if data.queue_date == date.today():
                    metrics = calc_service.calculate_today_queue_metrics(
                        queue_id, data.queue_date, data.service_ids
                    )
                else:
                    metrics = calc_service.calculate_future_queue_metrics(
                        queue_id, data.queue_date, data.service_ids
                    )
            else:
                # Find optimal queue
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
                
                # Get queue object
                queue = self.queue_service.get_queue_by_id(queue_id)
                if not queue:
                    raise HTTPException(status_code=404, detail="Selected queue not found")
            
            # Same-day duplicate check: if already in this queue for this date, return existing booking
            if data.queue_date == date.today():
                payload = self.queue_service.get_existing_booking_response_payload(
                    user_id=user_id,
                    queue_id=queue_id,
                    queue_date=data.queue_date,
                    business_id=data.business_id,
                    booking_calc_service=calc_service,
                )
                if payload is not None:
                    return BookingData(**payload)
            
            # Calculate service time
            total_service_time = sum(
                (qs.avg_service_time or 5) for qs in queue_services
            )
            
            # Generate token
            date_str = data.queue_date.strftime("%Y-%m-%d")
            token_number = await queue_manager.generate_token_number(str(queue_id), date_str)
            
            # Parse appointment time
            from datetime import datetime as dt
            try:
                appt_hour, appt_min = map(int, metrics["appointment_time"].split(":"))
                estimated_enqueue_dt = dt.combine(data.queue_date, time(appt_hour, appt_min))
                estimated_dequeue_dt = estimated_enqueue_dt + timedelta(minutes=total_service_time)
            except:
                estimated_enqueue_dt = None
                estimated_dequeue_dt = None
            
            # Create queue user
            queue_user = QueueUser(
                user_id=user_id,
                queue_id=queue_id,
                queue_date=data.queue_date,
                token_number=token_number,
                status=QUEUE_USER_REGISTERED,
                turn_time=total_service_time,
                notes=data.notes,
                is_scheduled=(data.queue_date > date.today()),
                estimated_enqueue_time=estimated_enqueue_dt,
                estimated_dequeue_time=estimated_dequeue_dt
            )
            self.db.add(queue_user)
            self.db.flush()
            
            # Link services
            for qs in queue_services:
                queue_user_service = QueueUserService(
                    queue_user_id=queue_user.uuid,
                    queue_service_id=qs.uuid
                )
                self.db.add(queue_user_service)
            
            self.db.commit()
            self.db.refresh(queue_user)
            
            # Add to Redis only if today
            if data.queue_date == date.today():
                await queue_manager.add_to_queue(
                    db=self.db,
                    queue_id=str(queue_id),
                    user_id=str(user_id),
                    date_str=date_str,
                    token_number=token_number,
                    total_service_time=total_service_time,
                    business_id=str(data.business_id)
                )
            
            # Build services data (batch load via service layer; no query in loop)
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


