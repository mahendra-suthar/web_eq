import uuid
import secrets
from sqlalchemy import Column, String, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import BaseModel


def generate_secret_code():
    """Generate a random secret code for employees"""
    return secrets.token_urlsafe(16)


class Employee(BaseModel):
    __tablename__ = "employees"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.uuid"), nullable=False)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("queues.uuid"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.uuid"), nullable=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    country_code = Column(String, nullable=True)
    profile_picture = Column(String, nullable=True)
    secret_code = Column(String, nullable=False, default=lambda: generate_secret_code())
    is_verified = Column(Boolean, default=False, nullable=False)

