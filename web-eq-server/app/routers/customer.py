"""
Customer-facing API: profile, appointments (list + detail), today's appointment.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.customer_controller import CustomerController
from app.controllers.queue_controller import QueueController
from app.schemas.profile import CustomerProfileResponse
from app.schemas.customer import (
    CustomerProfileUpdateInput,
    CustomerAppointmentListResponse,
    CustomerAppointmentDetailResponse,
)
from app.schemas.queue import CustomerTodayAppointmentsResponse
from app.middleware.permissions import get_current_user
from app.models.user import User
from app.core.constants import (
    CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT,
    CUSTOMER_APPOINTMENTS_MAX_LIMIT,
)

customer_router = APIRouter()


@customer_router.get(
    "/profile",
    response_model=CustomerProfileResponse,
    summary="Get customer profile",
)
async def get_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = CustomerController(db)
    return controller.get_profile(current_user)


@customer_router.patch(
    "/profile",
    response_model=CustomerProfileResponse,
    summary="Update customer profile",
)
async def update_profile(
    data: CustomerProfileUpdateInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = CustomerController(db)
    return controller.update_profile(current_user, data)


@customer_router.get(
    "/appointments/today",
    response_model=CustomerTodayAppointmentsResponse,
    summary="Get all of today's active appointments",
)
async def get_today_appointments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = QueueController(db)
    return controller.get_today_appointments(current_user.uuid)


@customer_router.get(
    "/appointments",
    response_model=CustomerAppointmentListResponse,
    summary="List customer appointments",
)
async def get_appointments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT, ge=1, le=CUSTOMER_APPOINTMENTS_MAX_LIMIT),
    offset: int = Query(0, ge=0),
):
    controller = CustomerController(db)
    return controller.get_appointments(current_user.uuid, limit=limit, offset=offset)


@customer_router.get(
    "/appointments/{queue_user_id}",
    response_model=CustomerAppointmentDetailResponse,
    summary="Get appointment by id",
)
async def get_appointment_by_id(
    queue_user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    controller = CustomerController(db)
    return controller.get_appointment_by_id(current_user.uuid, queue_user_id)
