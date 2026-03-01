import re
from pydantic import BaseModel, validator
from typing import Optional, List, Any, Dict
from uuid import UUID
from datetime import datetime, date

from app.schemas.user import UserData
from app.core.utils import format_time_12h, wait_minutes_from_now
from app.core.constants import QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS, QUEUE_USER_COMPLETED


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


class QueueCreateItem(BaseModel):
    name: str
    employee_id: Optional[UUID] = None
    services: List[QueueServiceCreate] = []


class QueueCreateBatch(BaseModel):
    business_id: UUID
    queues: List[QueueCreateItem]


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

    @classmethod
    def from_queue_service_and_service(cls, queue_service: Any, service: Any) -> "QueueServiceDetailData":
        """Build from QueueService ORM and Service ORM (or None for service)."""
        name = getattr(service, "name", None) if service else None
        return cls(
            uuid=queue_service.uuid,
            service_id=queue_service.service_id,
            service_name=name,
            description=getattr(queue_service, "description", None),
            service_fee=getattr(queue_service, "service_fee", None),
            avg_service_time=getattr(queue_service, "avg_service_time", None),
        )

    @classmethod
    def from_queue_service(cls, queue_service: Any, service_name: Optional[str] = None) -> "QueueServiceDetailData":
        """Build from QueueService ORM and optional service name (e.g. from lookup)."""
        return cls(
            uuid=queue_service.uuid,
            service_id=queue_service.service_id,
            service_name=service_name,
            description=getattr(queue_service, "description", None),
            service_fee=getattr(queue_service, "service_fee", None),
            avg_service_time=getattr(queue_service, "avg_service_time", None),
        )

    class Config:
        from_attributes = True


class QueueDetailData(BaseModel):
    """Full queue with associated queue services for detail page."""
    uuid: UUID
    business_id: UUID
    name: str
    status: Optional[int] = None
    limit: Optional[int] = None
    current_length: Optional[int] = None
    assigned_employee_id: Optional[UUID] = None  # employee currently assigned to this queue
    assigned_employee_name: Optional[str] = None  # for display without extra lookup
    services: List[QueueServiceDetailData] = []

    @classmethod
    def from_queue_and_services(
        cls,
        queue: Any,
        services: List[QueueServiceDetailData],
    ) -> "QueueDetailData":
        assigned_id = None
        assigned_name = None
        employees = getattr(queue, "employees", None) or []
        if employees:
            emp = employees[0]
            assigned_id = emp.uuid
            assigned_name = getattr(emp, "full_name", None) or ""
        return cls(
            uuid=queue.uuid,
            business_id=queue.merchant_id,
            name=queue.name,
            status=queue.status,
            limit=getattr(queue, "limit", None),
            current_length=getattr(queue, "current_length", None),
            assigned_employee_id=assigned_id,
            assigned_employee_name=assigned_name,
            services=services,
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

    @classmethod
    def from_row(cls, queue_user: Any, user: Any) -> "QueueUserData":
        """Build from (QueueUser, User) row from get_queue_users."""
        return cls(
            uuid=queue_user.uuid,
            user=UserData.from_user(user),
            queue_id=queue_user.queue_id,
            queue_date=queue_user.queue_date,
            token_number=queue_user.token_number,
            status=queue_user.status,
            priority=bool(queue_user.priority),
            enqueue_time=queue_user.enqueue_time,
            dequeue_time=queue_user.dequeue_time,
        )

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

    @classmethod
    def from_queue_user(cls, queue_user: Any) -> "QueueUserDetailResponse":
        """Build from loaded QueueUser (with user, queue, queue_user_services)."""
        service_names = [
            rel.queue_service.service.name
            for rel in (queue_user.queue_user_services or [])
            if rel.queue_service and rel.queue_service.service
        ]
        employee_id = str(queue_user.queue.employees[0].uuid) if queue_user.queue.employees else None
        return cls(
            user=QueueUserDetailUserInfo(
                full_name=queue_user.user.full_name,
                email=queue_user.user.email,
                phone_number=queue_user.user.phone_number,
                country_code=queue_user.user.country_code,
                profile_picture=queue_user.user.profile_picture,
            ),
            queue_name=queue_user.queue.name,
            service_names=service_names,
            queue_user_id=str(queue_user.uuid),
            token_number=queue_user.token_number,
            queue_date=queue_user.queue_date,
            enqueue_time=queue_user.enqueue_time,
            dequeue_time=queue_user.dequeue_time,
            status=queue_user.status,
            priority=queue_user.priority,
            turn_time=queue_user.turn_time,
            estimated_enqueue_time=queue_user.estimated_enqueue_time,
            estimated_dequeue_time=queue_user.estimated_dequeue_time,
            joined_queue=queue_user.joined_queue,
            is_scheduled=queue_user.is_scheduled,
            notes=queue_user.notes,
            cancellation_reason=queue_user.cancellation_reason,
            reschedule_count=queue_user.reschedule_count,
            employee_id=employee_id,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Customer Booking Schemas
# ─────────────────────────────────────────────────────────────────────────────

class QueueServiceInfo(BaseModel):
    queue_service_uuid: str
    service_uuid: str
    service_name: str
    price: Optional[float] = None
    duration: Optional[int] = None  # minutes


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
    services: List[QueueServiceInfo] = []


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

    @classmethod
    def from_booking_created(
        cls,
        queue_user: Any,
        queue_id: str,
        queue_name: str,
        business_id: str,
        business_name: str,
        queue_date: date,
        metrics: Dict[str, Any],
        services_data: List["BookingServiceData"],
        token_number: str,
    ) -> "BookingData":
        """Build for a newly created booking."""
        return cls(
            uuid=str(queue_user.uuid),
            token_number=token_number,
            queue_id=queue_id,
            queue_name=queue_name,
            business_id=business_id,
            business_name=business_name,
            queue_date=queue_date,
            position=metrics["position"],
            estimated_wait_minutes=metrics["wait_minutes"],
            estimated_wait_range=metrics["wait_range"],
            estimated_appointment_time=metrics["appointment_time"],
            services=services_data,
            status="confirmed",
            created_at=datetime.now(),
        )

    @classmethod
    def from_existing_booking(
        cls,
        existing_full: Any,
        queue_id: str,
        queue_name: str,
        business_id: str,
        business_name: str,
        queue_date: date,
        metrics: Dict[str, Any],
        services_data: List["BookingServiceData"],
    ) -> "BookingData":
        """Build for an existing queue user (already in queue)."""
        return cls(
            uuid=str(existing_full.uuid),
            token_number=existing_full.token_number or "",
            queue_id=queue_id,
            queue_name=queue_name,
            business_id=business_id,
            business_name=business_name,
            queue_date=queue_date,
            position=metrics["position"],
            estimated_wait_minutes=metrics["wait_minutes"],
            estimated_wait_range=metrics["wait_range"],
            estimated_appointment_time=metrics["appointment_time"],
            services=services_data,
            status="confirmed",
            created_at=existing_full.created_at or datetime.now(),
            already_in_queue=True,
        )

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

    @classmethod
    def from_user_dict(cls, u: Dict[str, Any]) -> "LiveQueueUserItem":
        """Build from a user dict produced by build_live_queue_users_raw (or equivalent)."""
        est_wait = (
            wait_minutes_from_now(u.get("estimated_enqueue_time"))
            if u.get("status") == QUEUE_USER_REGISTERED
            else None
        )
        est_dt = u.get("estimated_dequeue_time")
        enq_dt = u.get("estimated_enqueue_time")
        if u.get("status") == QUEUE_USER_IN_PROGRESS and est_dt:
            appt_time = format_time_12h(est_dt)
        elif u.get("status") == QUEUE_USER_REGISTERED and enq_dt:
            appt_time = format_time_12h(enq_dt)
        else:
            appt_time = None
        return cls(
            uuid=u["uuid"],
            full_name=u.get("full_name"),
            phone=u.get("phone", ""),
            token=u.get("token"),
            service_summary=u.get("service_summary", ""),
            status=u["status"],
            enqueue_time=u.get("enqueue_time"),
            dequeue_time=u.get("dequeue_time"),
            position=u.get("position"),
            estimated_wait_minutes=est_wait,
            estimated_appointment_time=appt_time,
        )


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

    @classmethod
    def from_build(
        cls,
        queue: Any,
        queue_date: date,
        users_raw: List[Dict[str, Any]],
        employee_on_leave: bool = False,
    ) -> "LiveQueueData":
        """Build from queue, date, raw user dicts (e.g. from build_live_queue_users_raw), and leave flag."""
        waiting_count = sum(1 for u in users_raw if u.get("status") == QUEUE_USER_REGISTERED)
        in_progress_count = sum(1 for u in users_raw if u.get("status") == QUEUE_USER_IN_PROGRESS)
        completed_count = sum(1 for u in users_raw if u.get("status") == QUEUE_USER_COMPLETED)
        current_token: Optional[str] = None
        for u in users_raw:
            if u.get("status") == QUEUE_USER_IN_PROGRESS:
                current_token = u.get("token")
                break
        return cls(
            queue_id=str(queue.uuid),
            queue_name=queue.name,
            queue_status=getattr(queue, "status", None),
            date=queue_date.isoformat(),
            waiting_count=waiting_count,
            in_progress_count=in_progress_count,
            completed_count=completed_count,
            current_token=current_token,
            employee_on_leave=employee_on_leave,
            users=[LiveQueueUserItem.from_user_dict(u) for u in users_raw],
        )


class CustomerTodayAppointmentResponse(BaseModel):
    """Today's active appointment for the logged-in customer (waiting or in_progress)."""
    queue_user_id: str
    queue_id: str
    queue_name: str
    business_id: str
    business_name: str
    queue_date: date
    token_number: str
    status: int  # 1=waiting, 2=in_progress
    position: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None
    estimated_wait_range: Optional[str] = None
    estimated_appointment_time: Optional[str] = None  # 12h e.g. "4:30 PM"
    service_summary: Optional[str] = None
    queue_service_uuids: List[str] = []

    @classmethod
    def from_queue_user_and_metrics(
        cls,
        qu: Any,
        queue: Any,
        business_id: str,
        business_name: str,
        metrics: Dict[str, Any],
        service_summary: Optional[str],
        appointment_time_12h: Optional[str],
        queue_service_uuids: Optional[List[str]] = None,
    ) -> "CustomerTodayAppointmentResponse":
        """Build from queue user, queue, business ids/names, computed metrics, service summary, and formatted time."""
        return cls(
            queue_user_id=str(qu.uuid),
            queue_id=str(qu.queue_id),
            queue_name=queue.name if queue else "",
            business_id=business_id,
            business_name=business_name,
            queue_date=qu.queue_date,
            token_number=qu.token_number or "",
            status=qu.status,
            position=metrics.get("position"),
            estimated_wait_minutes=metrics.get("wait_minutes"),
            estimated_wait_range=metrics.get("wait_range"),
            estimated_appointment_time=appointment_time_12h,
            service_summary=service_summary,
            queue_service_uuids=queue_service_uuids or [],
        )


class CustomerTodayAppointmentsResponse(BaseModel):
    items: List[CustomerTodayAppointmentResponse]
