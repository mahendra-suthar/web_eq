from pydantic import BaseModel
from uuid import UUID
from typing import Optional

from app.models.service import Service
from app.models.queue import QueueService


class ServiceData(BaseModel):
    uuid: UUID  # QueueService uuid (business-specific service instance)
    service_uuid: UUID  # Service uuid (global service)
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    category_id: Optional[UUID] = None
    service_fee: Optional[float] = None
    avg_service_time: Optional[int] = None  # in minutes

    @classmethod
    def from_service(cls, service: Service):
        """Create ServiceData from Service model (for backward compatibility)"""
        return cls(
            uuid=service.uuid,  # type: ignore
            service_uuid=service.uuid,  # type: ignore
            name=service.name,  # type: ignore
            description=service.description,  # type: ignore
            image=service.image,  # type: ignore
            category_id=service.category_id  # type: ignore
        )

    @classmethod
    def from_queue_service_and_service(cls, queue_service: QueueService, service: Service):
        """Create ServiceData from QueueService and Service models (combined data)"""
        # Prefer QueueService description if available, otherwise use Service description
        description = queue_service.description if queue_service.description else service.description  # type: ignore
        
        return cls(
            uuid=queue_service.uuid,  # type: ignore  # Business-specific service instance UUID
            service_uuid=service.uuid,  # type: ignore  # Global service UUID
            name=service.name,  # type: ignore
            description=description,  # type: ignore
            image=service.image,  # type: ignore
            category_id=service.category_id,  # type: ignore
            service_fee=queue_service.service_fee,  # type: ignore
            avg_service_time=queue_service.avg_service_time  # type: ignore
        )
