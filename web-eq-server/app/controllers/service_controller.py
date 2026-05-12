import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from uuid import UUID
from typing import List

from app.services.service_service import ServiceService
from app.schemas.service import ServiceData

logger = logging.getLogger(__name__)


class ServiceController:
    def __init__(self, db: Session):
        self.db = db
        self.service = ServiceService(db)

    async def get_all_services(self) -> List[ServiceData]:
        try:
            services = self.service.get_all_services()
            return [ServiceData.from_service(s) for s in services]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_all_services")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_services_by_categories(self, category_ids: List[UUID]) -> List[ServiceData]:
        try:
            services = self.service.get_services_by_categories(category_ids)
            return [ServiceData.from_service(s) for s in services]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_services_by_categories")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_services_by_business(self, business_id: UUID) -> List[ServiceData]:
        try:
            services = self.service.get_services_by_business_category(business_id)
            return [ServiceData.from_service(s) for s in services]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_services_by_business (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
