import logging
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.qr import business_qr_png, employee_qr_png
from app.models.user import User
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService

logger = logging.getLogger(__name__)


class QRController:
    def __init__(self, db: Session):
        self.db = db
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)

    def get_business_qr(self, user: User) -> bytes:
        try:
            business = self.business_service.get_business_by_owner(user.uuid)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found.")
            return business_qr_png(str(business.uuid))
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_qr (user_id=%s)", user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_my_employee_qr(self, user: User) -> bytes:
        """QR for the authenticated employee's own booking page."""
        try:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            if not employee:
                raise HTTPException(status_code=404, detail="Employee profile not found.")
            if employee.queue_id is None:
                raise HTTPException(
                    status_code=422,
                    detail="Assign a queue to this employee before generating a QR code.",
                )
            return employee_qr_png(str(employee.business_id), str(employee.queue_id))
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_my_employee_qr (user_id=%s)", user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_qr(self, employee_uuid: UUID, user: User) -> bytes:
        """QR for a specific employee — scoped to the authenticated business owner."""
        try:
            business = self.business_service.get_business_by_owner(user.uuid)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found.")

            employee = self.employee_service.get_employee_by_uuid_and_business(
                employee_uuid, business.uuid
            )
            if not employee:
                raise HTTPException(status_code=404, detail="Employee not found.")

            if employee.queue_id is None:
                raise HTTPException(
                    status_code=422,
                    detail="Assign a queue to this employee before generating a QR code.",
                )
            return employee_qr_png(str(business.uuid), str(employee.queue_id))
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_employee_qr (employee_uuid=%s user_id=%s)", employee_uuid, user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
