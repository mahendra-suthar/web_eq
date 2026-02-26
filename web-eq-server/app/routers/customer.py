"""
Customer-facing API: today's appointment, etc.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.queue_controller import QueueController
from app.schemas.queue import CustomerTodayAppointmentResponse
from app.middleware.permissions import get_current_user
from app.models.user import User

customer_router = APIRouter()


@customer_router.get(
    "/appointments/today",
    response_model=Optional[CustomerTodayAppointmentResponse],
    summary="Get today's active appointment",
)
async def get_today_appointment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the logged-in user's active (waiting or in_progress) appointment for today, if any.
    Filters: user_id = current user, date = today (app TZ), status IN (waiting, in_progress).
    Returns latest if multiple. Includes position, estimated wait, expected time, token, queue info.
    """
    controller = QueueController(db)
    return controller.get_today_appointment(current_user.uuid)
