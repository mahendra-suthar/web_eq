from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from typing import List

from app.models.user import User
from app.services.schedule_service import ScheduleService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.models.schedule import ScheduleEntityType
from app.schemas.schedule import ScheduleCreateInput, ScheduleData


class ScheduleController:
    def __init__(self, db: Session):
        self.db = db
        self.schedule_service = ScheduleService(db)
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)

    def can_edit_schedule(self, user: User, entity_id, entity_type_enum: ScheduleEntityType) -> bool:
        if entity_type_enum == ScheduleEntityType.BUSINESS:
            business = self.business_service.get_business_by_owner(user.uuid)
            return business is not None and str(business.uuid) == str(entity_id)
        if entity_type_enum == ScheduleEntityType.EMPLOYEE:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            return employee is not None and str(employee.uuid) == str(entity_id)
        return False

    async def create_schedules(self, payload: ScheduleCreateInput, user: User) -> List[ScheduleData]:
        try:
            entity_type_enum = ScheduleEntityType[payload.entity_type.upper()]
            if not self.can_edit_schedule(user, payload.entity_id, entity_type_enum):
                raise HTTPException(status_code=403, detail="Not allowed to update this schedule")

            is_business = entity_type_enum == ScheduleEntityType.BUSINESS

            if is_business and payload.is_always_open is not None:
                self.business_service.update_registration_state(
                    business_id=payload.entity_id,
                    is_always_open=payload.is_always_open,
                    current_step=2,
                )

            self.schedule_service.delete_schedules_by_entity(payload.entity_id, entity_type_enum)
            created_schedules = self.schedule_service.create_schedules(
                payload.entity_id, entity_type_enum, payload.schedules
            )

            self.schedule_service.commit_and_refresh_schedules(created_schedules)
            return [ScheduleData.from_schedule(schedule) for schedule in created_schedules]

        except HTTPException:
            self.db.rollback()
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create schedules: {str(e)}")

