import uuid
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Float, Time, Date, TIMESTAMP, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel, Base


class Queue(BaseModel):
    __tablename__ = "queues"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    merchant_id = Column(UUID(as_uuid=True), ForeignKey("businesses.uuid"), nullable=False)
    name = Column(String, nullable=False)
    limit = Column(Integer, nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    status = Column(Integer, nullable=True)
    current_user = Column(UUID(as_uuid=True), ForeignKey("users.uuid"), nullable=True)
    current_length = Column(Integer, nullable=True)
    serves_num = Column(Integer, nullable=True)
    is_counter = Column(Boolean, default=False)
    last_token_number = Column(String, nullable=True)
    qr_code = Column(String, nullable=True)


class QueueUser(BaseModel):
    __tablename__ = "queue_users"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.uuid"), nullable=False)
    enqueue_time = Column(TIMESTAMP(timezone=True), nullable=True)
    dequeue_time = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Integer, nullable=True)
    priority = Column(Boolean, default=False)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("queues.uuid"), nullable=False)
    queue_date = Column(Date, nullable=False)
    token_number = Column(String, nullable=True)
    turn_time = Column(Integer, nullable=True)  # In Minutes
    estimated_enqueue_time = Column(DateTime, nullable=True)
    estimated_dequeue_time = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    reschedule_count = Column(Integer, default=0)
    joined_queue = Column(Boolean, default=False)
    is_scheduled = Column(Boolean, default=False, nullable=False)


class QueueService(BaseModel):
    """Links services to businesses - services are global, this creates business-specific service instances"""
    __tablename__ = "queue_services"

    uuid = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id = Column(UUID(as_uuid=True), ForeignKey("services.uuid"), nullable=False)
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.uuid"), nullable=False)
    status = Column(Integer, nullable=True)
    queue_id = Column(UUID(as_uuid=True), ForeignKey("queues.uuid"), nullable=True)
    description = Column(String, nullable=True)
    service_fee = Column(Float, nullable=True)
    fee_type = Column(Integer, nullable=True)
    start_time = Column(Time, nullable=True)
    end_time = Column(Time, nullable=True)
    avg_service_time = Column(Integer, nullable=True)  # in minutes


class QueueUserService(Base):
    """Junction table linking queue users to queue services"""
    __tablename__ = "queue_user_business_services"

    queue_user_id = Column(UUID(as_uuid=True), ForeignKey("queue_users.uuid", ondelete="CASCADE"), primary_key=True)
    queue_service_id = Column(UUID(as_uuid=True), ForeignKey("queue_services.uuid", ondelete="CASCADE"), primary_key=True)

