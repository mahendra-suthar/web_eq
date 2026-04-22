import logging
from datetime import date as date_type
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from uuid import UUID

from app.core.constants import BIZ_EARLIEST_TIME, BIZ_LATEST_TIME
from app.models.user import User
from app.models.schedule import ScheduleEntityType
from app.services.schedule_service import ScheduleService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.schemas.schedule import (
    ScheduleCreateInput, ScheduleData, ScheduleInput,
    ScheduleExceptionCreate, ScheduleExceptionData, ScheduleExceptionUpdate,
)

logger = logging.getLogger(__name__)


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
            if employee is not None and str(employee.uuid) == str(entity_id):
                return True
            employee = self.employee_service.get_employee_by_id(entity_id)
            if employee is None:
                return False
            business = self.business_service.get_business_by_owner(user.uuid)
            return business is not None and str(business.uuid) == str(employee.business_id)
        return False

    def get_business_schedule_data_for_validation(self, business_id):
        return self.schedule_service.get_business_schedule_data_for_validation(business_id)

    def validate_employee_schedule_within_business(
        self,
        employee_schedules: List[ScheduleInput],
        is_always_open: bool,
        business_by_day: dict,
    ) -> str | None:
        for inp in employee_schedules:
            day = inp.day_of_week
            biz = business_by_day.get(day)
            if is_always_open:
                continue
            if biz is None or not getattr(biz, "is_open", False):
                if inp.is_open:
                    return f"Employee cannot be open on day {day}: business is closed that day."
                continue
            biz_open = getattr(biz, "opening_time", None) or BIZ_EARLIEST_TIME
            biz_close = getattr(biz, "closing_time", None) or BIZ_LATEST_TIME
            if not inp.is_open:
                continue
            emp_open = inp.opening_time or BIZ_EARLIEST_TIME
            emp_close = inp.closing_time or BIZ_LATEST_TIME
            if emp_open < biz_open:
                return f"Employee opening time on day {day} must not be before business opening time."
            if emp_close > biz_close:
                return f"Employee closing time on day {day} must not be after business closing time."
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule CRUD
    # ──────────────────────────────────────────────────────────────────────────

    async def create_schedules(
        self, payload: ScheduleCreateInput, user: User
    ) -> List[ScheduleData]:
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

            if entity_type_enum == ScheduleEntityType.EMPLOYEE:
                employee = self.employee_service.get_employee_by_id(payload.entity_id)
                if not employee:
                    raise HTTPException(status_code=404, detail="Employee not found")
                is_always_open, business_by_day = self.get_business_schedule_data_for_validation(
                    employee.business_id
                )
                err = self.validate_employee_schedule_within_business(
                    payload.schedules, is_always_open, business_by_day
                )
                if err:
                    raise HTTPException(status_code=400, detail=err)

            self.schedule_service.replace_schedules_for_entity(
                payload.entity_id, entity_type_enum, payload.schedules
            )
            schedules_with_breaks = self.schedule_service.get_schedules_with_breaks(
                payload.entity_id, entity_type_enum
            )
            return [ScheduleData.from_schedule(s) for s in schedules_with_breaks]

        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_schedules (entity_id=%s)", payload.entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_schedules(
        self, entity_id: UUID, entity_type: str
    ) -> List[ScheduleData]:
        try:
            entity_type_enum = ScheduleEntityType[entity_type.upper()]
            schedules = self.schedule_service.get_schedules_with_breaks(entity_id, entity_type_enum)
            return [ScheduleData.from_schedule(s) for s in schedules]
        except KeyError:
            raise HTTPException(status_code=400, detail="Invalid entity_type")
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_schedules (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule Exception CRUD
    # ──────────────────────────────────────────────────────────────────────────

    async def get_schedule_exceptions(
        self, schedule_id: UUID
    ) -> List[ScheduleExceptionData]:
        try:
            excs = self.schedule_service.get_exceptions_for_schedule(schedule_id)
            return [ScheduleExceptionData.from_orm(e) for e in excs]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_schedule_exceptions (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def create_schedule_exception(
        self, payload: ScheduleExceptionCreate
    ) -> ScheduleExceptionData:
        try:
            exc = self.schedule_service.create_schedule_exception(payload)
            return ScheduleExceptionData.from_orm(exc)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to create_schedule_exception (schedule_id=%s)", payload.schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type, payload: ScheduleExceptionUpdate
    ) -> ScheduleExceptionData:
        try:
            exc = self.schedule_service.update_schedule_exception(
                schedule_id, exception_date, payload
            )
            return ScheduleExceptionData.from_orm(exc)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to update_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def delete_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type
    ) -> dict:
        try:
            deleted = self.schedule_service.delete_schedule_exception(schedule_id, exception_date)
            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail=f"No exception found for date {exception_date}",
                )
            return {"success": True}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to delete_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
