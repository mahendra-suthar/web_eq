from sqlalchemy.orm import Session
from typing import List

from app.models.category import Category


class CategoryService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_all_categories(self) -> List[Category]:
        return self.db.query(Category).all()
