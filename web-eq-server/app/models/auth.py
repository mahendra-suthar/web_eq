import uuid
from sqlalchemy import Column, String, Integer, SmallInteger, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID

from app.db.database import Base


class UserLogin(Base):
    __tablename__ = "user_logins"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    country_code = Column(String, nullable=False)  # Stores "+91" (with +)
    phone_number = Column(String, nullable=False)
    otp_hash = Column(String, nullable=False)            
    status = Column(SmallInteger, default=0)            
    attempts = Column(Integer, default=0)                
    expires_at = Column(DateTime)
    
    __table_args__ = (
        Index('idx_phone_lookup', 'country_code', 'phone_number'),
    )

