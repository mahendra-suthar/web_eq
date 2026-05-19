import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.controllers.contact_controller import ContactFormController
from app.db.database import get_db
from app.schemas.contact import ContactFormRequest, ContactFormResponse
from app.services.contact_service import check_rate_limit

logger = logging.getLogger(__name__)

contact_router = APIRouter()


def _get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


@contact_router.post("/contact_form", response_model=ContactFormResponse)
async def submit_contact_form(
    payload: ContactFormRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
) -> ContactFormResponse:
    ip = _get_client_ip(request)

    if ip and not await check_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail={"message": "Too many submissions. Please wait before trying again."},
        )

    result = ContactFormController(db).submit(payload, background_tasks, ip)
    return ContactFormResponse(**result)
