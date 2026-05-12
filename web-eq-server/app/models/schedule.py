import uuid
from sqlalchemy import Column, Integer, Time, Boolean, Enum, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.models.base import BaseModel


class ScheduleEntityType(str, enum.Enum):
    BUSINESS = "BUSINESS"
    EMPLOYEE = "EMPLOYEE"


class Schedule(BaseModel):
    __tablename__ = "schedules"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    entity_type = Column(Enum(ScheduleEntityType), nullable=False)
    day_of_week = Column(Integer, nullable=False)   # 0 = Monday, 6 = Sunday
    opening_time = Column(Time, nullable=True)
    closing_time = Column(Time, nullable=True)
    is_open = Column(Boolean, default=False, nullable=False)

    breaks = relationship(
        "ScheduleBreak",
        back_populates="schedule",
        cascade="all, delete-orphan",
        lazy="select",
    )
    exceptions = relationship(
        "ScheduleException",
        back_populates="schedule",
        cascade="all, delete-orphan",
        lazy="select",
    )


class ScheduleBreak(BaseModel):
    __tablename__ = "schedule_breaks"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id = Column(
        UUID(as_uuid=True),
        ForeignKey("schedules.uuid", ondelete="CASCADE"),
        nullable=False,
    )
    break_start = Column(Time, nullable=False)
    break_end = Column(Time, nullable=False)

    schedule = relationship("Schedule", back_populates="breaks")


class ScheduleException(BaseModel):
    __tablename__ = "schedule_exceptions"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id = Column(
        UUID(as_uuid=True),
        ForeignKey("schedules.uuid", ondelete="CASCADE"),
        nullable=False,
    )
    exception_date = Column(Date, nullable=False)
    special_opening_time = Column(Time, nullable=True)
    special_closing_time = Column(Time, nullable=True)
    is_closed = Column(Boolean, default=False, nullable=False)

    schedule = relationship("Schedule", back_populates="exceptions")
