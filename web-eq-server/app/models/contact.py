import uuid
from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.models.base import BaseModel


class ContactForm(BaseModel):
    __tablename__ = "contact_forms"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    full_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    country_code = Column(String(10), nullable=True)
    message = Column(Text, nullable=False)
    ip_address = Column(String(45), nullable=True)
