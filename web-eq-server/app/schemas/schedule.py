from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import time, date
from uuid import UUID

from app.models.schedule import Schedule


# ─────────────────────────────────────────────────────────────────────────────
# Break schemas
# ─────────────────────────────────────────────────────────────────────────────

class BreakTimeInput(BaseModel):
    """One break window submitted by the client."""
    break_start: time
    break_end: time

    @model_validator(mode="after")
    def validate_break_window(self):
        if self.break_start >= self.break_end:
            raise ValueError("break_start must be before break_end")
        return self


class BreakData(BaseModel):
    """One break window returned from the API."""
    uuid: str
    schedule_id: str
    break_start: str
    break_end: str

    @classmethod
    def from_orm(cls, obj) -> "BreakData":
        return cls(
            uuid=str(obj.uuid),
            schedule_id=str(obj.schedule_id),
            break_start=obj.break_start.strftime("%H:%M"),
            break_end=obj.break_end.strftime("%H:%M"),
        )

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Schedule input / data
# ─────────────────────────────────────────────────────────────────────────────

class ScheduleInput(BaseModel):
    """One day's schedule (used when creating/updating schedules)."""
    day_of_week: int
    opening_time: Optional[time] = None
    closing_time: Optional[time] = None
    is_open: bool = False
    break_times: List[BreakTimeInput] = []

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
        if self.opening_time and self.closing_time:
            for br in self.break_times:
                if br.break_start <= self.opening_time:
                    raise ValueError("break_start must be after opening_time")
                if br.break_end >= self.closing_time:
                    raise ValueError("break_end must be before closing_time")
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
            days = [s.day_of_week for s in v]
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
    """Full schedule row with its breaks — returned from the API."""
    uuid: str
    entity_id: str
    entity_type: str
    day_of_week: int
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None
    is_open: bool
    breaks: List[BreakData] = []

    @classmethod
    def from_schedule(cls, schedule: Schedule) -> "ScheduleData":
        def _fmt(t) -> Optional[str]:
            return t.strftime("%H:%M") if t else None

        entity_type = getattr(schedule, "entity_type", None)
        entity_type_str = (
            entity_type.value if entity_type and hasattr(entity_type, "value")
            else str(entity_type) if entity_type else "BUSINESS"
        )
        day_of_week_val = getattr(schedule, "day_of_week", 0)
        is_open_val = getattr(schedule, "is_open", False)

        return cls(
            uuid=str(schedule.uuid),
            entity_id=str(schedule.entity_id),
            entity_type=entity_type_str,
            day_of_week=int(day_of_week_val) if day_of_week_val is not None else 0,
            opening_time=_fmt(getattr(schedule, "opening_time", None)),
            closing_time=_fmt(getattr(schedule, "closing_time", None)),
            is_open=bool(is_open_val) if is_open_val is not None else False,
            breaks=[BreakData.from_orm(b) for b in getattr(schedule, "breaks", [])],
        )

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────────────────────────────────────
# Schedule exception schemas
# ─────────────────────────────────────────────────────────────────────────────

class ScheduleExceptionCreate(BaseModel):
    """Create a date-specific override for a schedule (holiday, special hours)."""
    schedule_id: UUID
    exception_date: date
    special_opening_time: Optional[time] = None
    special_closing_time: Optional[time] = None
    is_closed: bool = False

    @model_validator(mode="after")
    def validate_special_times(self):
        if not self.is_closed:
            if self.special_opening_time and self.special_closing_time:
                if self.special_opening_time >= self.special_closing_time:
                    raise ValueError("special_opening_time must be before special_closing_time")
        return self


class ScheduleExceptionData(BaseModel):
    """Schedule exception row returned from the API."""
    uuid: str
    schedule_id: str
    exception_date: date
    special_opening_time: Optional[str] = None
    special_closing_time: Optional[str] = None
    is_closed: bool

    @classmethod
    def from_orm(cls, obj) -> "ScheduleExceptionData":
        def _fmt(t) -> Optional[str]:
            return t.strftime("%H:%M") if t else None

        return cls(
            uuid=str(obj.uuid),
            schedule_id=str(obj.schedule_id),
            exception_date=obj.exception_date,
            special_opening_time=_fmt(obj.special_opening_time),
            special_closing_time=_fmt(obj.special_closing_time),
            is_closed=bool(obj.is_closed),
        )

    class Config:
        from_attributes = True


class ScheduleExceptionUpdate(BaseModel):
    """Partial update for a schedule exception row."""
    special_opening_time: Optional[time] = None
    special_closing_time: Optional[time] = None
    is_closed: Optional[bool] = None

    @model_validator(mode="after")
    def validate_special_times(self):
        if self.is_closed is False or self.is_closed is None:
            if self.special_opening_time and self.special_closing_time:
                if self.special_opening_time >= self.special_closing_time:
                    raise ValueError("special_opening_time must be before special_closing_time")
        return self
