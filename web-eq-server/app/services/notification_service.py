"""
NotificationService — DB CRUD for the notifications table.
All queries are scoped to user_id.
"""
import logging
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

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
        except SQLAlchemyError:
            self.db.rollback()
            raise
        return notif

    def get_for_user(
        self,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> Tuple[List[Notification], int]:
        """Return (rows, total_count) ordered newest-first."""
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

    def get_unread_count(self, user_id: UUID) -> int:
        return (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
            .count()
        )

    def mark_read(self, notification_id: UUID, user_id: UUID) -> Optional[Notification]:
        """Mark a single notification as read (scoped to user_id for safety)."""
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
            notif.is_read = True
            try:
                self.db.commit()
                self.db.refresh(notif)
            except SQLAlchemyError:
                self.db.rollback()
                raise
        return notif

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
        except SQLAlchemyError:
            self.db.rollback()
            raise
