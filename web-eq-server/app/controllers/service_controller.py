from sqlalchemy.orm import Session
from fastapi import HTTPException
from uuid import UUID
from typing import List

from app.services.service_service import ServiceService
from app.schemas.service import ServiceData


class ServiceController:
    def __init__(self, db: Session):
        self.db = db
        self.service = ServiceService(db)

    async def get_all_services(self) -> List[ServiceData]:
        try:
            services = self.service.get_all_services()
            return [ServiceData.from_service(s) for s in services]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch services: {str(e)}")

    async def get_services_by_categories(self, category_ids: List[UUID]) -> List[ServiceData]:
        try:
            services = self.service.get_services_by_categories(category_ids)
            return [ServiceData.from_service(s) for s in services]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch services: {str(e)}")

    async def get_services_by_business(self, business_id: UUID) -> List[ServiceData]:
        try:
            services = self.service.get_services_by_business_category(business_id)
            return [ServiceData.from_service(s) for s in services]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch services: {str(e)}")
