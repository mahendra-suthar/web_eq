from sqlalchemy.orm import Session
from typing import List, Dict
from uuid import UUID

from app.services.category_service import CategoryService
from app.schemas.category import CategoryData, CategoryWithServicesData


class CategoryController:
    def __init__(self, db: Session):
        self.service = CategoryService(db)
    
    def get_all_categories(self) -> List[CategoryData]:
        categories = self.service.get_all_categories()
        return [CategoryData.from_category(cat) for cat in categories]
    
    def get_categories_with_services(self) -> List[CategoryWithServicesData]:
        rows = self.service.get_categories_with_services()

        data: Dict[UUID, Dict] = {}

        for category, service_uuid, service_name in rows:
            if category.uuid not in data:
                data[category.uuid] = {
                    "category": category,
                    "services": []
                }

            if service_uuid and service_name:
                data[category.uuid]["services"].append({
                    "id": str(service_uuid),
                    "name": str(service_name)
                })

        return [
            CategoryWithServicesData.from_category_with_services(
                item["category"],
                item["services"]
            )
            for item in data.values()
        ]

