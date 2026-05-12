import uuid
from sqlalchemy import Column, String, Enum, Float
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.models.base import BaseModel


class EntityType(str, enum.Enum):
    USER = "USER"
    BUSINESS = "BUSINESS"
    EMPLOYEE = "EMPLOYEE"


class AddressType(str, enum.Enum):
    HOME = "HOME"
    WORK = "WORK"
    OTHER = "OTHER"


class Address(BaseModel):
    __tablename__ = "addresses"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    unit_number = Column(String, nullable=True)  # House No. (Users) / Shop No. (Businesses)
    building = Column(String, nullable=True)  # Building Name
    floor = Column(String, nullable=True)  # Floor number
    street_1 = Column(String, nullable=False)
    street_2 = Column(String, nullable=True)
    city = Column(String, nullable=False)
    district = Column(String, nullable=True)
    state = Column(String, nullable=False)
    postal_code = Column(String, nullable=False)
    country = Column(String, default="INDIA", nullable=True)
    address_type = Column(Enum(AddressType), nullable=False, default=AddressType.WORK)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    entity_type = Column(Enum(EntityType), nullable=False)
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    images = Column(String, nullable=True)

