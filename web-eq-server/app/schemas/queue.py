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
    employee_id: Optional[UUID] = None
    services: List[QueueServiceCreate] = []
    avg_service_time: Optional[int] = None
    fee: Optional[float] = None


class QueueUpdate(BaseModel):
    """Partial update for queue (name, status, limit, assigned employee)."""
    name: Optional[str] = None
    status: Optional[int] = None
    limit: Optional[int] = None
    employee_id: Optional[UUID] = None  # assign employee to queue; null to unassign


class QueueServiceAddItem(BaseModel):
    """One service to add to a queue."""
    service_id: UUID
    service_fee: Optional[float] = None
    avg_service_time: Optional[int] = None
    description: Optional[str] = None


class QueueServicesAdd(BaseModel):
    services: List[QueueServiceAddItem]


class QueueServiceUpdate(BaseModel):
    """Partial update for a queue_service row."""
    service_fee: Optional[float] = None
    avg_service_time: Optional[int] = None
    description: Optional[str] = None


class QueueData(BaseModel):
    uuid: UUID
    business_id: UUID
    name: str
    status: Optional[int] = None
    is_counter: Optional[bool] = None
    limit: Optional[int] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_queue(cls, queue) -> "QueueData":
        return cls(
            uuid=queue.uuid,
            business_id=queue.merchant_id,
            name=queue.name,
            status=queue.status,
            is_counter=getattr(queue, "is_counter", None),
            limit=getattr(queue, "limit", None),
            created_at=getattr(queue, "created_at", None),
        )

    class Config:
        from_attributes = True


class QueueServiceDetailData(BaseModel):
    """Queue service row for queue detail (queue_services joined with service name)."""
    uuid: UUID
    service_id: UUID
    service_name: Optional[str] = None
    description: Optional[str] = None
    service_fee: Optional[float] = None
    avg_service_time: Optional[int] = None  # minutes


class QueueDetailData(BaseModel):
    """Full queue with associated queue services for detail page."""
    uuid: UUID
    business_id: UUID
    name: str
    status: Optional[int] = None
    limit: Optional[int] = None
    current_length: Optional[int] = None
    assigned_employee_id: Optional[UUID] = None  # employee currently assigned to this queue
    services: List[QueueServiceDetailData] = []


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

class QueueOptionData(BaseModel):
    """Queue option with calculated metrics for booking"""
    queue_id: str
    queue_name: str
    position: int
    estimated_wait_minutes: int
    estimated_wait_range: str  # e.g., "15-25 min"
    estimated_appointment_time: str  # HH:MM format
    is_recommended: bool
    available: bool
    # Set when the queue is unavailable for a specific reason rather than just being full.
    # e.g. "employee_not_available" — frontend should show this instead of metrics.
    unavailability_reason: Optional[str] = None


class AvailableSlotData(BaseModel):
    """Available slot/queue for customer booking (legacy)"""
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
    queue_id: Optional[UUID] = None  # Optional - auto-selected if not provided
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
    estimated_wait_range: str  # e.g., "15-25 min"
    estimated_appointment_time: str
    services: List[BookingServiceData]
    status: str
    created_at: datetime
    already_in_queue: Optional[bool] = False

    class Config:
        from_attributes = True


class BookingPreviewData(BaseModel):
    """Preview of queue options before booking confirmation"""
    business_id: str
    date: str
    queues: List[QueueOptionData]
    recommended_queue_id: Optional[str] = None


class BusinessQueueState(BaseModel):
    """Real-time queue state for a business"""
    business_id: str
    date: str
    queues: List[AvailableSlotData]
    total_waiting: int

class LiveQueueUserItem(BaseModel):
    uuid: str
    full_name: Optional[str] = None
    phone: str                    # "{country_code} {phone_number}"
    token: Optional[str] = None
    service_summary: str          # "Haircut · Beard trim"
    status: int                   # 1=waiting, 2=in_progress, 3=completed
    enqueue_time: Optional[datetime] = None
    dequeue_time: Optional[datetime] = None
    position: Optional[int] = None  # 1-indexed, only for waiting users
    estimated_wait_minutes: Optional[int] = None   # for waiting: est. wait; for in_progress: 0
    estimated_appointment_time: Optional[str] = None  # 12h e.g. "4:30 PM" (when expected to be served/done)


class LiveQueueData(BaseModel):
    queue_id: str
    queue_name: str
    queue_status: Optional[int] = None   # 1=registered, 2=running, 3=stopped
    date: str
    waiting_count: int
    in_progress_count: int
    completed_count: int
    current_token: Optional[str] = None  # token of in_progress user
    users: List[LiveQueueUserItem]        # ordered: completed → in_progress → waiting
    employee_on_leave: bool = False     # True when queue's employee has no schedule / closed exception for this date
