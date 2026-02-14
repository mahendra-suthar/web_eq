import uuid
from sqlalchemy import Column, String, ForeignKey, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


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
    is_verified = Column(Boolean, default=False, nullable=False)
    invitation_code = Column(String(32), unique=True, nullable=True, index=True)
    invitation_code_expires_at = Column(DateTime(timezone=True), nullable=True)

    queue = relationship("Queue", back_populates="employees", foreign_keys=[queue_id], lazy="select")
    user = relationship("User", back_populates="employees", foreign_keys=[user_id], lazy="select")
    business = relationship("Business", back_populates="employees", foreign_keys=[business_id], lazy="select")

