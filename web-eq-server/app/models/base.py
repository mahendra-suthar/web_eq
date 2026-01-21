from sqlalchemy import Column, TIMESTAMP
from sqlalchemy.sql import func

from app.db.database import Base


class BaseModel(Base):
    """Base model with common timestamp fields"""
    __abstract__ = True
    
    created_at = Column(
        TIMESTAMP(timezone=True), 
        server_default=func.now(), 
        nullable=False
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )

