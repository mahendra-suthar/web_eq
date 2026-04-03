from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from uuid import UUID

from app.models.category import Category
from app.models.service import Service


class CategoryService:
    def __init__(self, db: Session):
        self.db = db

    def get_all_categories(self) -> List[Category]:
        return self.db.query(Category).all()

    def get_category_by_uuid(self, category_uuid: UUID) -> Optional[Category]:
        return self.db.query(Category).filter(Category.uuid == category_uuid).first()

    def get_categories_tree_rows(self, parent_uuid: Optional[UUID] = None) -> List[Any]:
        sub_count_sq = (
            self.db.query(
                Category.parent_category_id.label("parent_id"),
                func.count(Category.uuid).label("sub_count"),
            )
            .filter(Category.parent_category_id.isnot(None))
            .group_by(Category.parent_category_id)
            .subquery()
        )

        svc_count_sq = (
            self.db.query(
                Service.category_id.label("cat_id"),
                func.count(Service.uuid).label("svc_count"),
            )
            .group_by(Service.category_id)
            .subquery()
        )

        q = (
            self.db.query(
                Category.uuid,
                Category.name,
                Category.description,
                Category.image,
                Category.parent_category_id,
                func.coalesce(sub_count_sq.c.sub_count, 0).label("subcategories_count"),
                func.coalesce(svc_count_sq.c.svc_count, 0).label("services_count"),
            )
            .outerjoin(sub_count_sq, sub_count_sq.c.parent_id == Category.uuid)
            .outerjoin(svc_count_sq, svc_count_sq.c.cat_id == Category.uuid)
        )

        if parent_uuid is not None:
            q = q.filter(
                or_(
                    Category.parent_category_id == parent_uuid,
                    Category.uuid == parent_uuid,
                )
            )

        return q.order_by(Category.parent_category_id.asc().nullsfirst(), Category.name).all()

    def get_subcategories_minimal(self, parent_uuid: Optional[UUID] = None) -> List[Any]:
        q = self.db.query(Category.uuid, Category.name).filter(Category.parent_category_id.isnot(None))
        if parent_uuid is not None:
            q = q.filter(Category.parent_category_id == parent_uuid)
        return q.order_by(Category.name).all()
