from sqlalchemy.orm import Session
from typing import List

from app.services.category_service import CategoryService
from app.schemas.category import CategoryData


class CategoryController:
    def __init__(self, db: Session):
        self.service = CategoryService(db)
    
    def get_all_categories(self) -> List[CategoryData]:
        categories = self.service.get_all_categories()
        return [CategoryData.from_category(cat) for cat in categories]

