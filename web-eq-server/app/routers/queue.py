from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List, Optional
from datetime import date

from app.db.database import get_db
from app.controllers.queue_controller import QueueController
from app.schemas.queue import (
    QueueCreate, QueueCreateBatch, QueueData, QueueDetailData, QueueServiceDetailData,
    QueueUpdate, QueueServicesAdd, QueueServiceUpdate,
    QueueUserData, QueueUserDetailResponse,
    AvailableSlotData, BookingCreateInput, BookingData, BookingPreviewData,
    LiveQueueData,
    SlotsListResponse,
    NextCustomerResponse,
)
from app.schemas.service import ServiceData
from app.middleware.permissions import get_current_user, require_roles
from app.models.user import User


queue_router = APIRouter()


@queue_router.post("/create_queue", response_model=QueueData)
async def create_queue(payload: QueueCreate, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.create_queue(payload)


@queue_router.post("/create_queues_batch", response_model=List[QueueData])
async def create_queues_batch(payload: QueueCreateBatch, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.create_queues_batch(payload)

@queue_router.get("/get_queues/{business_id}", response_model=List[QueueData])
async def get_queues(business_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_queues(business_id)


@queue_router.get("/get_queue/{queue_id}", response_model=QueueDetailData)
async def get_queue_detail(queue_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_queue_detail(queue_id)


@queue_router.put("/update_queue/{queue_id}", response_model=QueueData)
async def update_queue(
    queue_id: UUID, business_id: UUID, payload: QueueUpdate, db: Session = Depends(get_db),
):
    controller = QueueController(db)
    return await controller.update_queue(queue_id, business_id, payload)


@queue_router.post("/add_services_to_queue/{queue_id}", response_model=List[QueueServiceDetailData])
async def add_services_to_queue(
    queue_id: UUID, business_id: UUID, payload: QueueServicesAdd, db: Session = Depends(get_db),
):
    controller = QueueController(db)
    return await controller.add_services_to_queue(queue_id, business_id, payload)


@queue_router.patch("/queue_service/{queue_service_id}", response_model=QueueServiceDetailData)
async def update_queue_service(
    queue_service_id: UUID, payload: QueueServiceUpdate, db: Session = Depends(get_db),
):
    controller = QueueController(db)
    return await controller.update_queue_service(queue_service_id, payload)


@queue_router.delete("/queue_service/{queue_service_id}")
async def delete_queue_service(queue_service_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    await controller.delete_queue_service(queue_service_id)
    return {"success": True}


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


@queue_router.get("/slots", response_model=SlotsListResponse)
def get_queue_slots(
    queue_id: UUID = Query(..., description="Queue UUID"),
    date: date = Query(..., description="Slot date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get or generate bookable time slots for a queue on a date (FIXED/APPROXIMATE/HYBRID)."""
    controller = QueueController(db)
    return controller.get_queue_slots(queue_id, date)


@queue_router.get("/{queue_id}/next", response_model=Optional[NextCustomerResponse])
async def get_next_customer(
    queue_id: UUID,
    date: date = Query(..., description="Queue date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Next customer to serve (FIXED overdue > QUEUE FIFO > APPROXIMATE in window)."""
    controller = QueueController(db)
    return controller.get_next_customer(queue_id, date)


@queue_router.get("/{queue_id}/live", response_model=LiveQueueData)
async def get_live_queue(
    queue_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = QueueController(db)
    return await controller.get_live_queue(queue_id)


@queue_router.post("/{queue_id}/next", response_model=LiveQueueData)
async def advance_queue(
    queue_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = QueueController(db)
    return await controller.advance_queue(queue_id)


@queue_router.post("/{queue_id}/start", response_model=QueueData)
async def start_queue(
    queue_id: UUID,
    business_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = QueueController(db)
    return await controller.start_queue(queue_id, business_id)


@queue_router.post("/{queue_id}/stop", response_model=QueueData)
async def stop_queue(
    queue_id: UUID,
    business_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = QueueController(db)
    return await controller.stop_queue(queue_id, business_id)


@queue_router.post("/book", response_model=BookingData)
async def create_booking(
    payload: BookingCreateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    controller = QueueController(db)
    return await controller.create_booking(
        user_id=current_user.uuid,
        data=payload
    )

