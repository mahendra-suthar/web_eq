from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.middleware.permissions import get_current_user
from app.models.user import User
from app.schemas.notification import NotificationData, NotificationListResponse
from app.controllers.notification_controller import NotificationController

notification_router = APIRouter()


@notification_router.get("/", response_model=NotificationListResponse)
def list_notifications(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationController(db).list_notifications(UUID(str(current_user.uuid)), limit, offset)


@notification_router.patch("/mark-read/{notification_id}", response_model=NotificationData)
def mark_notification_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationController(db).mark_read(notification_id, UUID(str(current_user.uuid)))


@notification_router.patch("/mark-all-read")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return NotificationController(db).mark_all_read(UUID(str(current_user.uuid)))
