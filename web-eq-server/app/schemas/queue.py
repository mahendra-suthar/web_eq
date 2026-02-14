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


class QueueUserDetailUserInfo(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: str
    country_code: str
    profile_picture: Optional[str] = None


class QueueUserDetailResponse(BaseModel):
    user: QueueUserDetailUserInfo
    queue_name: str
    service_names: List[str] = []
    employee_id: Optional[str] = None  # for redirect to employee detail → queue tab
    queue_user_id: str
    token_number: Optional[str] = None
    queue_date: date
    enqueue_time: Optional[datetime] = None
    dequeue_time: Optional[datetime] = None
    status: Optional[int] = None
    priority: bool = False
    turn_time: Optional[int] = None  # minutes
    estimated_enqueue_time: Optional[datetime] = None
    estimated_dequeue_time: Optional[datetime] = None
    joined_queue: bool = False
    is_scheduled: bool = False
    notes: Optional[str] = None
    cancellation_reason: Optional[str] = None
    reschedule_count: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Customer Booking Schemas
# ─────────────────────────────────────────────────────────────────────────────

class AvailableSlotData(BaseModel):
    """Available slot/queue for customer booking"""
    queue_id: str
    queue_name: str
    date: str
    available: bool
    current_position: int
    capacity: Optional[int] = None
    estimated_wait_minutes: int
    estimated_appointment_time: str
    status: str  # "Available", "Filling Fast", "Full"


class BookingServiceInput(BaseModel):
    """Service to be booked (QueueService UUID)"""
    queue_service_id: UUID


class BookingCreateInput(BaseModel):
    """Input for creating a booking"""
    business_id: UUID
    queue_id: UUID
    queue_date: date
    service_ids: List[UUID]  # QueueService UUIDs
    notes: Optional[str] = None


class BookingServiceData(BaseModel):
    """Service details in a booking"""
    uuid: str
    name: str
    price: Optional[float] = None
    duration: Optional[int] = None  # minutes


class BookingData(BaseModel):
    """Booking confirmation response"""
    uuid: str
    token_number: str
    queue_id: str
    queue_name: str
    business_id: str
    business_name: str
    queue_date: date
    position: int
    estimated_wait_minutes: int
    estimated_appointment_time: str
    services: List[BookingServiceData]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class BusinessQueueState(BaseModel):
    """Real-time queue state for a business"""
    business_id: str
    date: str
    queues: List[AvailableSlotData]
    total_waiting: int
