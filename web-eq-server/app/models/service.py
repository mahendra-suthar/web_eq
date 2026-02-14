import uuid
from sqlalchemy import String, Column, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.models.base import BaseModel


class Service(BaseModel):
    """Service model - services are global/category-based, not per-business"""
    __tablename__ = "services"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True)
    description = Column(String, nullable=True)
    image = Column(String, nullable=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.uuid"), nullable=True)

    category = relationship("Category", back_populates="services", foreign_keys=[category_id], lazy="select")
    queue_services = relationship("QueueService", back_populates="service", lazy="select")

