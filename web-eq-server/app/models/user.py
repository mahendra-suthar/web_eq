import uuid
from sqlalchemy import Column, String, Integer, TIMESTAMP, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.database import Base
from app.core.config import DEFAULT_COUNTRY_CODE


class User(Base):
    __tablename__ = "users"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    country_code = Column(String, default=DEFAULT_COUNTRY_CODE, nullable=False)
    phone_number = Column(String, unique=True, nullable=False)
    full_name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    date_of_birth = Column(TIMESTAMP(timezone=True), nullable=True)
    gender = Column(Integer, nullable=True)
    email_verify = Column(Boolean, default=False, nullable=False)
    profile_picture = Column(String, nullable=True)

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    roles = relationship("UserRoles", back_populates="user", cascade="all, delete-orphan", passive_deletes=True, lazy="selectin")
    employees = relationship("Employee", back_populates="user", lazy="select")
    businesses_owned = relationship("Business", back_populates="owner", lazy="select")
    queue_users = relationship("QueueUser", back_populates="user", lazy="select")
    reviews = relationship("Review", back_populates="user", lazy="select")

