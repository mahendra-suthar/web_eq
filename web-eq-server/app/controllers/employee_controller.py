import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from uuid import UUID

from app.models.user import User
from app.services.employee_service import EmployeeService
from app.services.business_service import BusinessService
from app.schemas.employee import BusinessEmployeesInput, EmployeeData, EmployeeUpdate

logger = logging.getLogger(__name__)


class EmployeeController:
    def __init__(self, db: Session):
        self.db = db
        self.employee_service = EmployeeService(db)
        self.business_service = BusinessService(db)

    async def create_employees(self, data: BusinessEmployeesInput) -> list[EmployeeData]:
        try:
            employees_list, _invitation_codes = self.employee_service.add_employees(data)
            self.business_service.update_registration_state(business_id=data.business_id, current_step=4)
            return [EmployeeData.from_employee(emp) for emp in employees_list]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to create_employees (business_id=%s)", data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_employee(self, employee_id: UUID, data: EmployeeUpdate) -> EmployeeData:
        try:
            employee = self.employee_service.update_employee(employee_id, data)
            return EmployeeData.from_employee(employee)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to update_employee (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_my_profile(self, user: User, data: EmployeeUpdate) -> EmployeeData:
        try:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            if not employee:
                raise HTTPException(status_code=404, detail={"message": "Employee profile not found"})
            updated = self.employee_service.update_employee(employee.uuid, data)
            return EmployeeData.from_employee(updated)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to update_my_profile (user_id=%s)", user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_employees(self, business_id: UUID, page: int, limit: int, search: str | None) -> list[EmployeeData]:
        try:
            employees = self.employee_service.get_employees(business_id, page, limit, search)
            return [EmployeeData.from_employee(emp) for emp in employees]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_employees (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
