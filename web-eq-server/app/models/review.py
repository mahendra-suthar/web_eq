import uuid
from sqlalchemy import Column, ForeignKey, Float, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Review(BaseModel):
    __tablename__ = "reviews"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.uuid"), nullable=False)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.uuid"), nullable=False)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("queues.uuid"), nullable=True)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.uuid"), nullable=True)
    employee_id = Column(UUID(as_uuid=True), ForeignKey("employees.uuid"), nullable=True)
    queue_user_id = Column(UUID(as_uuid=True), ForeignKey("queue_users.uuid"), nullable=True)

    rating = Column(Float, nullable=False)
    comment = Column(Text, nullable=True)
    is_verified = Column(Boolean, default=True, nullable=False)

    user = relationship("User", foreign_keys=[user_id], lazy="selectin")
    business = relationship("Business", back_populates="reviews", foreign_keys=[business_id], lazy="selectin")
