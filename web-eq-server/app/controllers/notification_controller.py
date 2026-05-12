"""
NotificationController — orchestrates notification CRUD.
Router delegates here; this layer calls NotificationService.
"""
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.schemas.notification import NotificationData, NotificationListResponse
from app.services.notification_service import NotificationService


class NotificationController:
    def __init__(self, db: Session) -> None:
        self.svc = NotificationService(db)

    def list_notifications(
        self, user_id: UUID, limit: int, offset: int
    ) -> NotificationListResponse:
        rows, total = self.svc.get_for_user(user_id, limit=limit, offset=offset)
        unread = self.svc.get_unread_count(user_id)
        return NotificationListResponse(
            notifications=[NotificationData.from_notification(n) for n in rows],
            total=total,
            unread_count=unread,
            limit=limit,
            offset=offset,
        )

    def mark_read(self, notification_id: UUID, user_id: UUID) -> NotificationData:
        notif = self.svc.mark_read(notification_id, user_id)
        if not notif:
            raise HTTPException(status_code=404, detail="Notification not found")
        return NotificationData.from_notification(notif)

    def mark_all_read(self, user_id: UUID) -> dict:
        updated = self.svc.mark_all_read(user_id)
        return {"updated": updated}
