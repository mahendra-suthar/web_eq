import re
from pydantic import BaseModel, validator
from typing import Optional, List
from uuid import UUID
from datetime import datetime, date

from app.schemas.user import UserData


class QueueServiceCreate(BaseModel):
    service_id: UUID
    avg_service_time: Optional[int] = None  # minutes
    service_fee: Optional[float] = None


class QueueCreate(BaseModel):
    business_id: UUID
    name: str
    employee_id: UUID
    services: List[QueueServiceCreate]
    avg_service_time: Optional[int] = None
    fee: Optional[float] = None


class QueueData(BaseModel):
    uuid: UUID
    business_id: UUID
    name: str
    status: Optional[int] = None

    @classmethod
    def from_queue(cls, queue) -> "QueueData":
        return cls(
            uuid=queue.uuid,
            business_id=queue.merchant_id,
            name=queue.name,
            status=queue.status
        )

    class Config:
        from_attributes = True


class QueueUserData(BaseModel):
    uuid: UUID
    user: UserData
    queue_id: UUID
    queue_date: date
    token_number: Optional[str] = None
    status: Optional[int] = None
    priority: bool = False
    enqueue_time: Optional[datetime] = None
    dequeue_time: Optional[datetime] = None

    class Config:
        from_attributes = True
