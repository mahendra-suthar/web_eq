import uuid
from sqlalchemy import Column, String, Integer, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy import TIMESTAMP
from sqlalchemy.orm import relationship

from app.db.database import Base
from app.core.config import DEFAULT_COUNTRY_CODE
from app.core.constants import BUSINESS_DRAFT


class EmployeeType:
    SELF_EMPLOYEE = 1
    ONLY_EMPLOYEE = 2
    SELF_WITH_EMPLOYEE = 3


class Business(Base):
    __tablename__ = "businesses"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    country_code = Column(String, default=DEFAULT_COUNTRY_CODE, nullable=False)
    phone_number = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=True)
    password = Column(String, nullable=True)
    email_verify = Column(Boolean, default=False, nullable=False)
    about_business = Column(String, nullable=True)
    status = Column(Integer, default=BUSINESS_DRAFT, nullable=False)
    is_always_open = Column(Boolean, default=False, nullable=False)
    
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.uuid"), nullable=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.uuid"), nullable=False)
    
    qr_code = Column(String, nullable=True)
    profile_picture = Column(String, nullable=True)
    
    parent_business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.uuid"), nullable=True)
    owner_full_name = Column(String, nullable=True)
    owner_email = Column(String, nullable=True)
    owner_whatsapp_number = Column(String, nullable=True)
    business_type = Column(Integer, default=EmployeeType.SELF_EMPLOYEE, nullable=False)
    
    draft_data = Column(JSONB, nullable=True)
    current_step = Column(Integer, nullable=True)
    
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    owner = relationship("User", foreign_keys=[owner_id], lazy="selectin")
    category = relationship("Category", foreign_keys=[category_id], lazy="selectin")
    parent_business = relationship("Business", remote_side=[uuid], foreign_keys=[parent_business_id], lazy="selectin")

    __table_args__ = (
        UniqueConstraint("owner_id", name="uq_business_owner"),
    )



