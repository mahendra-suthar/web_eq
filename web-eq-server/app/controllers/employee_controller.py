from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from uuid import UUID

from app.models.user import User
from app.services.employee_service import EmployeeService
from app.services.business_service import BusinessService
from app.schemas.employee import BusinessEmployeesInput, EmployeeData, EmployeeUpdate


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
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create employees: {str(e)}")

    async def update_employee(self, employee_id: UUID, data: EmployeeUpdate) -> EmployeeData:
        try:
            employee = self.employee_service.update_employee(employee_id, data)
            return EmployeeData.from_employee(employee)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update employee: {str(e)}")

    async def update_my_profile(self, user: User, data: EmployeeUpdate) -> EmployeeData:
        try:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            if not employee:
                raise HTTPException(status_code=404, detail="Employee profile not found")
            updated = self.employee_service.update_employee(employee.uuid, data)
            return EmployeeData.from_employee(updated)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")

    async def get_employees(self, business_id: UUID, page: int, limit: int, search: str | None) -> list[EmployeeData]:
        try:
            employees = self.employee_service.get_employees(business_id, page, limit, search)
            return [EmployeeData.from_employee(emp) for emp in employees]
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to get employees: {str(e)}")
        
