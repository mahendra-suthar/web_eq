"""
Notification trigger helpers.

Each function persists a Notification row and pushes it live via WebSocket.
All are async and must be called inside try/except in the controller so that
notification failures never block a booking or queue operation.
"""
import logging
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.constants import (
    NOTIF_BOOKING_CONFIRMED,
    NOTIF_CALLED_NEXT,
    NOTIF_IN_SERVICE,
    NOTIF_NEW_CUSTOMER,
    NOTIF_SERVICE_COMPLETED,
)
from app.services.notification_service import NotificationService
from app.services.realtime.notification_manager import notification_manager

logger = logging.getLogger(__name__)


def _row_to_dict(notif) -> dict:
    """Serialise a Notification ORM row to a plain dict for WS push."""
    return {
        "uuid": str(notif.uuid),
        "user_id": str(notif.user_id),
        "type": notif.type,
        "title": notif.title,
        "body": notif.body,
        "data": notif.data,
        "is_read": notif.is_read,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    }


async def _persist_and_push(
    db: Session,
    user_id: UUID,
    type: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> None:
    svc = NotificationService(db)
    notif = svc.create(user_id=user_id, type=type, title=title, body=body, data=data)
    await notification_manager.push_to_user(str(user_id), _row_to_dict(notif))


# ─── Public trigger functions ─────────────────────────────────────────────────

async def notify_booking_confirmed(
    db: Session,
    user_id: UUID,
    token_number: str,
    wait_minutes: int,
    queue_name: str = "",
    business_name: str = "",
) -> None:
    """BOOKING_CONFIRMED → customer who just booked."""
    wait_text = f"{wait_minutes} min" if wait_minutes else "a few minutes"
    await _persist_and_push(
        db=db,
        user_id=user_id,
        type=NOTIF_BOOKING_CONFIRMED,
        title="Booking Confirmed",
        body=f"Token #{token_number} confirmed. Estimated wait: {wait_text}.",
        data={
            "token_number": token_number,
            "wait_minutes": wait_minutes,
            "queue_name": queue_name,
            "business_name": business_name,
        },
    )


async def notify_new_customer(
    db: Session,
    business_owner_id: UUID,
    employee_user_id: Optional[UUID],
    token_number: str,
    queue_name: str = "",
) -> None:
    """NEW_CUSTOMER → business owner + assigned employee (if different)."""
    title = "New Customer"
    body = f"Token #{token_number} has joined{' ' + queue_name if queue_name else ' the queue'}."
    data = {"token_number": token_number, "queue_name": queue_name}

    await _persist_and_push(db=db, user_id=business_owner_id, type=NOTIF_NEW_CUSTOMER,
                            title=title, body=body, data=data)

    if employee_user_id and employee_user_id != business_owner_id:
        await _persist_and_push(db=db, user_id=employee_user_id, type=NOTIF_NEW_CUSTOMER,
                                title=title, body=body, data=data)


async def notify_in_service(
    db: Session,
    user_id: UUID,
    token_number: str,
    queue_name: str = "",
) -> None:
    """IN_SERVICE → customer who just started being served."""
    await _persist_and_push(
        db=db,
        user_id=user_id,
        type=NOTIF_IN_SERVICE,
        title="You're Being Served",
        body=f"You're now being served! Token #{token_number}.",
        data={"token_number": token_number, "queue_name": queue_name},
    )


async def notify_called_next(
    db: Session,
    user_id: UUID,
    token_number: str,
    queue_name: str = "",
) -> None:
    """CALLED_NEXT → customer who just moved to position 1 in the waiting list."""
    await _persist_and_push(
        db=db,
        user_id=user_id,
        type=NOTIF_CALLED_NEXT,
        title="You're Next!",
        body=f"Please be ready — you're next in line. Token #{token_number}.",
        data={"token_number": token_number, "queue_name": queue_name},
    )


async def notify_service_completed(
    db: Session,
    user_id: UUID,
    token_number: str,
    queue_name: str = "",
) -> None:
    """SERVICE_COMPLETED → customer whose service just finished."""
    await _persist_and_push(
        db=db,
        user_id=user_id,
        type=NOTIF_SERVICE_COMPLETED,
        title="Service Complete",
        body=f"Your service (Token #{token_number}) is complete. Thank you!",
        data={"token_number": token_number, "queue_name": queue_name},
    )
