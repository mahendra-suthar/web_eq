from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from datetime import date

from app.db.database import get_db
from app.controllers.queue_controller import QueueController
from app.schemas.queue import (
    QueueCreate, QueueData, QueueUserData, QueueUserDetailResponse,
    AvailableSlotData, BookingCreateInput, BookingData, BookingPreviewData
)
from app.schemas.service import ServiceData
from app.middleware.permissions import get_current_user, require_roles
from app.models.user import User


queue_router = APIRouter()


@queue_router.post("/create_queue", response_model=QueueData)
async def create_queue(payload: QueueCreate, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.create_queue(payload)

@queue_router.get("/get_queues/{business_id}", response_model=List[QueueData])
async def get_queues(business_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_queues(business_id)


@queue_router.get("/queue-user/{queue_user_id}", response_model=QueueUserDetailResponse)
async def get_queue_user_detail(queue_user_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_queue_user_detail(queue_user_id)


@queue_router.get("/get_business_services/{business_id}", response_model=List[ServiceData])
async def get_business_services(business_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_business_services(business_id)


@queue_router.get("/get_users", response_model=List[QueueUserData])
async def get_queue_users(
    business_id: UUID | None = None,
    queue_id: UUID | None = None,
    employee_id: UUID | None = None,
    page: int = 1,
    limit: int = 10,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    controller = QueueController(db)
    return await controller.get_users(
        business_id=business_id,
        queue_id=queue_id,
        employee_id=employee_id,
        page=page,
        limit=limit,
        search=search,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Customer Booking Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@queue_router.post("/booking-preview", response_model=BookingPreviewData)
async def get_booking_preview(
    business_id: UUID = Query(..., description="Business UUID"),
    booking_date: date = Query(..., description="Date for booking (YYYY-MM-DD)"),
    service_ids: List[UUID] = Query(..., description="QueueService UUIDs"),
    db: Session = Depends(get_db)
):
    controller = QueueController(db)
    return await controller.get_booking_preview(
        business_id=business_id,
        booking_date=booking_date,
        service_ids=service_ids
    )


@queue_router.get("/available_slots/{business_id}", response_model=List[AvailableSlotData])
async def get_available_slots(
    business_id: UUID,
    booking_date: date = Query(..., description="Date for booking (YYYY-MM-DD)"),
    service_ids: Optional[List[UUID]] = Query(None, description="QueueService UUIDs to filter by"),
    db: Session = Depends(get_db)
):
    """
    Get available booking slots for a business on a specific date.
    
    Returns all queues with their availability status, wait times, and capacity.
    Optionally filter by service_ids to show only queues that offer those services.
    """
    controller = QueueController(db)
    return await controller.get_available_slots(
        business_id=business_id,
        booking_date=booking_date,
        service_ids=service_ids
    )


@queue_router.post("/book", response_model=BookingData)
async def create_booking(
    payload: BookingCreateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a booking for the authenticated user.
    
    Requires authentication. 
    - If queue_id provided: Use that queue (validates availability)
    - If queue_id NOT provided: Auto-select optimal queue (shortest wait)
    
    After booking:
    - User is added to the queue
    - Token number is generated
    - Position and wait time are calculated
    - For today's bookings: Added to Redis + WebSocket updates
    - For future bookings: Saved to DB only
    """
    controller = QueueController(db)
    return await controller.create_booking(
        user_id=current_user.uuid,
        data=payload
    )

