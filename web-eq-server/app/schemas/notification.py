from datetime import datetime
from typing import Any, List, Optional
from uuid import UUID

from pydantic import BaseModel


class NotificationData(BaseModel):
    uuid: str
    user_id: str
    type: str
    title: str
    body: str
    data: Optional[Any] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_notification(cls, n) -> "NotificationData":
        return cls(
            uuid=str(n.uuid),
            user_id=str(n.user_id),
            type=n.type,
            title=n.title,
            body=n.body,
            data=n.data,
            is_read=n.is_read,
            created_at=n.created_at,
        )


class NotificationListResponse(BaseModel):
    notifications: List[NotificationData]
    total: int
    unread_count: int
    limit: int
    offset: int
