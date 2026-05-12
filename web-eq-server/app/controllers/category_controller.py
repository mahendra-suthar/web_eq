from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.services.category_service import CategoryService
from app.schemas.category import CategoryData, CategoryTreeNode, SubcategoryMinimal
from app.utils.category_tree import build_category_tree


class CategoryController:
    def __init__(self, db: Session):
        self.service = CategoryService(db)

    def get_all_categories(self) -> List[CategoryData]:
        categories = self.service.get_all_categories()
        return [CategoryData.from_category(cat) for cat in categories]

    def get_categories_tree(self, parent_uuid: Optional[UUID] = None) -> List[CategoryTreeNode]:
        rows = self.service.get_categories_tree_rows(parent_uuid)
        return build_category_tree(rows, parent_uuid)

    def get_subcategories_minimal(self, parent_uuid: Optional[UUID] = None) -> List[SubcategoryMinimal]:
        rows = self.service.get_subcategories_minimal(parent_uuid)
        return [SubcategoryMinimal(uuid=str(r.uuid), name=str(r.name)) for r in rows]
