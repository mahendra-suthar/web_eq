"""
Customer-facing API schemas: profile update, appointment list/detail.
"""
from datetime import date, datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel


class CustomerProfileUpdateInput(BaseModel):
    """Fields allowed for PATCH /customer/profile."""
    full_name: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None  # YYYY-MM-DD
    gender: Optional[int] = None


class CustomerAppointmentListItem(BaseModel):
    """One row in the customer's appointment list (non-real-time). Includes metrics when status is waiting/in_progress."""
    queue_user_id: str
    queue_id: str
    queue_name: str
    business_id: str
    business_name: str
    queue_date: date
    status: int  # 1=waiting, 2=in_progress, 3=completed
    token_number: Optional[str] = None
    service_summary: Optional[str] = None
    created_at: Optional[datetime] = None
    # Populated for status 1 or 2
    position: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None
    estimated_wait_range: Optional[str] = None
    estimated_appointment_time: Optional[str] = None

    @classmethod
    def from_orm_row(
        cls,
        queue_user,
        queue,
        business,
        service_summary: Optional[str] = None,
        metrics: Optional[dict] = None,
    ) -> "CustomerAppointmentListItem":
        business_name = business.name if business else ""
        business_id = str(queue.merchant_id) if queue else ""
        return cls(
            queue_user_id=str(queue_user.uuid),
            queue_id=str(queue.uuid),
            queue_name=queue.name if queue else "",
            business_id=business_id,
            business_name=business_name,
            queue_date=queue_user.queue_date,
            status=queue_user.status,
            token_number=queue_user.token_number,
            service_summary=service_summary,
            created_at=getattr(queue_user, "created_at", None),
            position=metrics.get("position") if metrics else None,
            estimated_wait_minutes=metrics.get("wait_minutes") if metrics else None,
            estimated_wait_range=metrics.get("wait_range") if metrics else None,
            estimated_appointment_time=metrics.get("appointment_time") if metrics else None,
        )


class CustomerAppointmentDetailResponse(BaseModel):
    """Full appointment detail for GET /customer/appointments/{id}."""
    queue_user_id: str
    queue_id: str
    queue_name: str
    business_id: str
    business_name: str
    queue_date: date
    status: int
    token_number: Optional[str] = None
    service_summary: Optional[str] = None
    position: Optional[int] = None
    estimated_wait_minutes: Optional[int] = None
    estimated_wait_range: Optional[str] = None
    estimated_appointment_time: Optional[str] = None
    enqueue_time: Optional[datetime] = None
    dequeue_time: Optional[datetime] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_queue_user_and_metrics(
        cls,
        queue_user,
        queue,
        business,
        service_summary: Optional[str],
        metrics: Optional[dict],
    ) -> "CustomerAppointmentDetailResponse":
        business_name = business.name if business else ""
        business_id = str(queue.merchant_id) if queue else ""
        return cls(
            queue_user_id=str(queue_user.uuid),
            queue_id=str(queue.uuid),
            queue_name=queue.name if queue else "",
            business_id=business_id,
            business_name=business_name,
            queue_date=queue_user.queue_date,
            status=queue_user.status,
            token_number=queue_user.token_number,
            service_summary=service_summary,
            position=metrics.get("position") if metrics else None,
            estimated_wait_minutes=metrics.get("wait_minutes") if metrics else None,
            estimated_wait_range=metrics.get("wait_range") if metrics else None,
            estimated_appointment_time=metrics.get("appointment_time") if metrics else None,
            enqueue_time=queue_user.enqueue_time,
            dequeue_time=queue_user.dequeue_time,
            created_at=getattr(queue_user, "created_at", None),
        )


class CustomerAppointmentListResponse(BaseModel):
    """Paginated list of customer appointments."""
    items: List[CustomerAppointmentListItem]
    total: int
    has_more: bool
