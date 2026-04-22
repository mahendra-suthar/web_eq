"""
NotificationService — DB CRUD for the notifications table.
All queries are scoped to user_id.
"""
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.notification import Notification

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(
        self,
        user_id: UUID,
        type: str,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> Notification:
        """Persist and return a new Notification row."""
        notif = Notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            data=data,
            is_read=False,
        )
        try:
            self.db.add(notif)
            self.db.commit()
            self.db.refresh(notif)
            return notif
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create notification (user_id=%s type=%s)", user_id, type)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_for_user(
        self,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Notification], int]:
        """Return (rows, total_count) ordered newest-first."""
        try:
            base_q = self.db.query(Notification).filter(Notification.user_id == user_id)
            total = base_q.count()
            rows = (
                base_q
                .order_by(Notification.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return rows, total
        except Exception:
            logger.exception("Failed to get_for_user notifications (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_unread_count(self, user_id: UUID) -> int:
        try:
            return (
                self.db.query(Notification)
                .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
                .count()
            )
        except Exception:
            logger.exception("Failed to get_unread_count (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def mark_read(self, notification_id: UUID, user_id: UUID) -> Optional[Notification]:
        """Mark a single notification as read (scoped to user_id for safety)."""
        try:
            notif = (
                self.db.query(Notification)
                .filter(
                    Notification.uuid == notification_id,
                    Notification.user_id == user_id,
                )
                .first()
            )
            if not notif:
                return None
            if not notif.is_read:
                notif.is_read = True  # type: ignore[assignment]
                self.db.commit()
                self.db.refresh(notif)
            return notif
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to mark_read (notification_id=%s user_id=%s)", notification_id, user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def mark_all_read(self, user_id: UUID) -> int:
        """Mark all unread notifications as read. Returns number of rows updated."""
        try:
            updated = (
                self.db.query(Notification)
                .filter(
                    Notification.user_id == user_id,
                    Notification.is_read == False,  # noqa: E712
                )
                .update({"is_read": True}, synchronize_session=False)
            )
            self.db.commit()
            return updated
        except Exception:
            self.db.rollback()
            logger.exception("Failed to mark_all_read (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
