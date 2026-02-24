from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import List, Dict, Tuple

from app.models.schedule import Schedule, ScheduleEntityType
from app.models.business import Business
from app.schemas.schedule import ScheduleInput


class ScheduleService:
    def __init__(self, db: Session):
        self.db = db

    def get_schedules_by_entity(self, entity_id: UUID, entity_type: ScheduleEntityType) -> List[Schedule]:
        return self.db.query(Schedule).filter(
            Schedule.entity_id == entity_id,
            Schedule.entity_type == entity_type
        ).all()

    def get_business_schedule_data_for_validation(self, business_id: UUID) -> Tuple[bool, Dict[int, Schedule]]:
        business = self.db.query(Business).filter(Business.uuid == business_id).first()
        if not business:
            return False, {}
        is_always_open = bool(getattr(business, "is_always_open", False))
        business_schedules = self.get_schedules_by_entity(
            business_id, ScheduleEntityType.BUSINESS
        )
        by_day: Dict[int, Schedule] = {s.day_of_week: s for s in business_schedules}
        return is_always_open, by_day

    def delete_schedules_by_entity(self, entity_id: UUID, entity_type: ScheduleEntityType) -> None:
        self.db.query(Schedule).filter(
            Schedule.entity_id == entity_id,
            Schedule.entity_type == entity_type
        ).delete()

    def create_schedules(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        schedules: List[ScheduleInput]
    ) -> List[Schedule]:
        new_schedules = [
            Schedule(
                entity_id=entity_id,
                entity_type=entity_type,
                day_of_week=schedule.day_of_week,
                opening_time=schedule.opening_time,
                closing_time=schedule.closing_time,
                is_open=schedule.is_open
            )
            for schedule in schedules
        ]
        self.db.add_all(new_schedules)
        return new_schedules

    def commit_and_refresh_schedules(self, schedules: List[Schedule]) -> None:
        try:
            self.db.commit()
            for schedule in schedules:
                self.db.refresh(schedule)
        except SQLAlchemyError:
            self.db.rollback()
            raise

    def copy_business_schedule_to_employees(self, business_id: UUID, employee_ids: List[UUID]) -> List[Schedule]:
        if not employee_ids:
            return []
        business_schedules = self.get_schedules_by_entity(
            business_id, ScheduleEntityType.BUSINESS
        )
        if not business_schedules:
            return []
        new_schedules = [
            Schedule(
                entity_id=emp_id,
                entity_type=ScheduleEntityType.EMPLOYEE,
                day_of_week=s.day_of_week,
                opening_time=s.opening_time,
                closing_time=s.closing_time,
                is_open=s.is_open,
            )
            for emp_id in employee_ids
            for s in business_schedules
        ]
        self.db.add_all(new_schedules)
        return new_schedules

