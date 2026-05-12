import logging
from typing import Any, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.service import Service
from app.models.business import Business

logger = logging.getLogger(__name__)


class CategoryService:
    def __init__(self, db: Session):
        self.db = db

    def get_all_categories(self) -> List[Category]:
        try:
            return self.db.query(Category).all()
        except Exception:
            logger.exception("Failed to get_all_categories")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_category_by_uuid(self, category_uuid: UUID) -> Optional[Category]:
        try:
            return self.db.query(Category).filter(Category.uuid == category_uuid).first()
        except Exception:
            logger.exception("Failed to get_category_by_uuid (uuid=%s)", category_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_categories_tree_rows(self, parent_uuid: Optional[UUID] = None) -> List[Any]:
        try:
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
        except Exception:
            logger.exception("Failed to get_categories_tree_rows (parent_uuid=%s)", parent_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_subcategories_minimal(self, parent_uuid: Optional[UUID] = None) -> List[Any]:
        try:
            q = self.db.query(Category.uuid, Category.name).filter(Category.parent_category_id.isnot(None))
            if parent_uuid is not None:
                q = q.filter(Category.parent_category_id == parent_uuid)
            return q.order_by(Category.name).all()
        except Exception:
            logger.exception("Failed to get_subcategories_minimal (parent_uuid=%s)", parent_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # Admin CRUD

    def get_admin_categories_page(
        self,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
    ) -> Tuple[List[Any], int]:
        """Return paginated categories with subcategory, service, and business counts."""
        try:
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
            biz_count_sq = (
                self.db.query(
                    Business.category_id.label("cat_id"),
                    func.count(Business.uuid).label("biz_count"),
                )
                .group_by(Business.category_id)
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
                    func.coalesce(biz_count_sq.c.biz_count, 0).label("businesses_count"),
                )
                .outerjoin(sub_count_sq, sub_count_sq.c.parent_id == Category.uuid)
                .outerjoin(svc_count_sq, svc_count_sq.c.cat_id == Category.uuid)
                .outerjoin(biz_count_sq, biz_count_sq.c.cat_id == Category.uuid)
            )

            if search:
                q = q.filter(Category.name.ilike(f"%{search}%"))

            total: int = q.count()
            offset = (page - 1) * limit
            rows = q.order_by(Category.parent_category_id.asc().nullsfirst(), Category.name).offset(offset).limit(limit).all()
            return rows, total
        except Exception:
            logger.exception("Failed to get_admin_categories_page (page=%s search=%s)", page, search)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_category(
        self,
        name: str,
        description: Optional[str] = None,
        image: Optional[str] = None,
        parent_category_id: Optional[UUID] = None,
    ) -> Category:
        try:
            existing = self.db.query(Category).filter(
                func.lower(Category.name) == func.lower(name)
            ).first()
            if existing:
                raise HTTPException(status_code=409, detail={"message": f"Category '{name}' already exists."})
            if parent_category_id:
                parent = self.db.query(Category).filter(Category.uuid == parent_category_id).first()
                if not parent:
                    raise HTTPException(status_code=404, detail={"message": "Parent category not found."})
            category = Category(
                name=name,
                description=description,
                image=image,
                parent_category_id=parent_category_id,
            )
            self.db.add(category)
            self.db.commit()
            self.db.refresh(category)
            return category
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_category (name=%s)", name)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_category(
        self,
        category_uuid: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        image: Optional[str] = None,
        parent_category_id: Optional[UUID] = None,
    ) -> Category:
        try:
            category = self.db.query(Category).filter(Category.uuid == category_uuid).first()
            if not category:
                raise HTTPException(status_code=404, detail={"message": "Category not found."})
            if name and name != category.name:
                conflict = self.db.query(Category).filter(
                    func.lower(Category.name) == func.lower(name),
                    Category.uuid != category_uuid,
                ).first()
                if conflict:
                    raise HTTPException(status_code=409, detail={"message": f"Category '{name}' already exists."})
                category.name = name  # type: ignore[assignment]
            if description is not None:
                category.description = description  # type: ignore[assignment]
            if image is not None:
                category.image = image  # type: ignore[assignment]
            if parent_category_id is not None:
                if str(parent_category_id) == str(category_uuid):
                    raise HTTPException(status_code=400, detail={"message": "A category cannot be its own parent."})
                parent = self.db.query(Category).filter(Category.uuid == parent_category_id).first()
                if not parent:
                    raise HTTPException(status_code=404, detail={"message": "Parent category not found."})
                category.parent_category_id = parent_category_id  # type: ignore[assignment]
            self.db.commit()
            self.db.refresh(category)
            return category
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_category (uuid=%s)", category_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def delete_category(self, category_uuid: UUID) -> None:
        try:
            category = self.db.query(Category).filter(Category.uuid == category_uuid).first()
            if not category:
                raise HTTPException(status_code=404, detail={"message": "Category not found."})
            has_children = self.db.query(Category).filter(
                Category.parent_category_id == category_uuid
            ).first()
            if has_children:
                raise HTTPException(
                    status_code=409,
                    detail={"message": "Cannot delete category with subcategories. Delete or reassign them first."},
                )
            has_services = self.db.query(Service).filter(Service.category_id == category_uuid).first()
            if has_services:
                raise HTTPException(
                    status_code=409,
                    detail={"message": "Cannot delete category that has services. Remove or reassign them first."},
                )
            self.db.delete(category)
            self.db.commit()
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete_category (uuid=%s)", category_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
