from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import List

from app.models.schedule import Schedule, ScheduleEntityType
from app.schemas.schedule import ScheduleInput


class ScheduleService:
    def __init__(self, db: Session):
        self.db = db

    def get_schedules_by_entity(self, entity_id: UUID, entity_type: ScheduleEntityType) -> List[Schedule]:
        return self.db.query(Schedule).filter(
            Schedule.entity_id == entity_id,
            Schedule.entity_type == entity_type
        ).all()

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
                day_of_week=schedule_input.day_of_week,
                opening_time=schedule_input.opening_time,
                closing_time=schedule_input.closing_time,
                is_open=schedule_input.is_open
            )
            for schedule_input in schedules
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

