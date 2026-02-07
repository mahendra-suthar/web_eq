from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from uuid import UUID
import uuid

from app.models.category import Category
from app.models.service import Service


class CategoryService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_all_categories(self) -> List[Category]:
        return self.db.query(Category).all()
    
    def get_categories_with_services(self):
        return self.db.query(Category, Service.uuid, Service.name).outerjoin(Service, Category.uuid == Service.category_id).all()
    
    def get_category_by_uuid(self, category_uuid: str) -> Optional[Category]:
        try:
            uuid_obj = uuid.UUID(category_uuid)
            return self.db.query(Category).filter(Category.uuid == uuid_obj).first()
        except (ValueError, TypeError):
            return None