import logging

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from app.schemas.contact import ContactFormRequest
from app.services.contact_service import ContactFormService

logger = logging.getLogger(__name__)


class ContactFormController:
    def __init__(self, db: Session) -> None:
        self.service = ContactFormService(db)

    def submit(
        self,
        payload: ContactFormRequest,
        background_tasks: BackgroundTasks,
        ip_address: str | None,
    ) -> dict:
        try:
            self.service.save(
                full_name=payload.full_name,
                email=payload.email,
                phone=payload.phone,
                country_code=payload.country_code,
                message=payload.message,
                ip_address=ip_address,
            )
        except Exception:
            logger.exception("Failed to save contact form submission (ip=%s)", ip_address)
            raise HTTPException(
                status_code=500,
                detail={"message": "An unexpected error occurred. Please try again."},
            )

        background_tasks.add_task(
            self.service.send_email,
            full_name=payload.full_name,
            email=payload.email,
            phone=payload.phone,
            message=payload.message,
        )

        return {"message": "Your message has been received. We'll get back to you within 24 hours."}
