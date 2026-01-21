from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import time
from uuid import UUID

from app.models.schedule import Schedule


class ScheduleInput(BaseModel):
    day_of_week: int
    opening_time: Optional[time] = None
    closing_time: Optional[time] = None
    is_open: bool = False

    @field_validator("day_of_week")
    @classmethod
    def validate_day_of_week(cls, v: int) -> int:
        if v < 0 or v > 6:
            raise ValueError("day_of_week must be between 0 (Monday) and 6 (Sunday)")
        return v

    @model_validator(mode="after")
    def validate_times(self):
        if self.is_open and self.opening_time and self.closing_time:
            if self.opening_time >= self.closing_time:
                raise ValueError("opening_time must be before closing_time")
        return self


class ScheduleCreateInput(BaseModel):
    entity_id: UUID
    entity_type: str
    is_always_open: Optional[bool] = None
    schedules: List[ScheduleInput]

    @field_validator("entity_type")
    @classmethod
    def validate_entity_type(cls, v: str) -> str:
        if v.upper() not in ["BUSINESS", "EMPLOYEE"]:
            raise ValueError("entity_type must be either 'BUSINESS' or 'EMPLOYEE'")
        return v.upper()

    @field_validator("schedules")
    @classmethod
    def validate_schedules(cls, v: List[ScheduleInput]) -> List[ScheduleInput]:
        if v:
            days = [schedule.day_of_week for schedule in v]
            if len(days) != len(set(days)):
                raise ValueError("Duplicate day_of_week found in schedules")
        return v

    @model_validator(mode="after")
    def validate_schedules_with_always_open(self):
        if self.is_always_open and self.entity_type == "BUSINESS":
            return self
        if not self.schedules:
            raise ValueError("schedules list cannot be empty when is_always_open is False or not set")
        return self


class ScheduleData(BaseModel):
    uuid: str
    entity_id: str
    entity_type: str
    day_of_week: int
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    is_open: bool

    @classmethod
    def from_schedule(cls, schedule: Schedule) -> "ScheduleData":
        opening_time = getattr(schedule, 'opening_time', None)
        closing_time = getattr(schedule, 'closing_time', None)
        opening_time_str = opening_time.strftime("%H:%M") if opening_time else None
        closing_time_str = closing_time.strftime("%H:%M") if closing_time else None
        
        entity_type = getattr(schedule, 'entity_type', None)
        if entity_type and hasattr(entity_type, 'value'):
            entity_type_str = entity_type.value
        else:
            entity_type_str = str(entity_type) if entity_type else "BUSINESS"
        
        day_of_week_val = getattr(schedule, 'day_of_week', 0)
        is_open_val = getattr(schedule, 'is_open', False)
        
        return cls(
            uuid=str(schedule.uuid),
            entity_id=str(schedule.entity_id),
            entity_type=entity_type_str,
            day_of_week=int(day_of_week_val) if day_of_week_val is not None else 0,
            opening_time=opening_time_str,
            closing_time=closing_time_str,
            is_open=bool(is_open_val) if is_open_val is not None else False
        )

    class Config:
        from_attributes = True

