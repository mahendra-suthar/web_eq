import uuid
from sqlalchemy import Column, Integer, Time, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.models.base import BaseModel


class ScheduleEntityType(str, enum.Enum):
    BUSINESS = "BUSINESS"
    EMPLOYEE = "EMPLOYEE"


class Schedule(BaseModel):
    __tablename__ = "schedules"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id = Column(UUID(as_uuid=True), nullable=False)  # Business or Employee ID
    entity_type = Column(Enum(ScheduleEntityType), nullable=False)
    day_of_week = Column(Integer, nullable=False)  # 0 = Monday, 6 = Sunday
    opening_time = Column(Time, nullable=True)
    closing_time = Column(Time, nullable=True)
    is_open = Column(Boolean, default=False, nullable=False)

