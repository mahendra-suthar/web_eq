from typing import Any, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.service import Service
from app.models.business import Business
from app.models.category import Category


class ServiceService:
    def __init__(self, db: Session):
        self.db = db

    def get_services_by_categories(self, category_ids: List[UUID]) -> List[Service]:
        if not category_ids:
            return []
        return (
            self.db.query(Service)
            .filter(Service.category_id.in_(category_ids))
            .order_by(Service.name)
            .all()
        )

    def get_all_services(self) -> List[Service]:
        return self.db.query(Service).order_by(Service.name).all()

    def get_services_by_business_category(self, business_id: UUID) -> List[Service]:
        business = self.db.query(Business).filter(Business.uuid == business_id).first()
        if not business or not business.category_id:
            return self.db.query(Service).order_by(Service.name).all()
        return (
            self.db.query(Service)
            .filter(Service.category_id == business.category_id)
            .order_by(Service.name)
            .all()
        )

    # ── Admin CRUD ────────────────────────────────────────────────────────────

    def get_admin_services_page(
        self,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
        category_id: Optional[UUID] = None,
    ) -> Tuple[List[Any], int]:
        q = (
            self.db.query(
                Service.uuid,
                Service.name,
                Service.description,
                Service.image,
                Service.category_id,
                Category.name.label("category_name"),
            )
            .outerjoin(Category, Category.uuid == Service.category_id)
        )
        if search:
            q = q.filter(Service.name.ilike(f"%{search}%"))
        if category_id:
            q = q.filter(Service.category_id == category_id)
        total: int = q.count()
        offset = (page - 1) * limit
        rows = q.order_by(Service.name).offset(offset).limit(limit).all()
        return rows, total

    def create_service(
        self,
        name: str,
        description: Optional[str] = None,
        image: Optional[str] = None,
        category_id: Optional[UUID] = None,
    ) -> Service:
        existing = self.db.query(Service).filter(
            func.lower(Service.name) == func.lower(name)
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Service '{name}' already exists.")
        if category_id:
            cat = self.db.query(Category).filter(Category.uuid == category_id).first()
            if not cat:
                raise HTTPException(status_code=404, detail="Category not found.")
        service = Service(name=name, description=description, image=image, category_id=category_id)
        self.db.add(service)
        self.db.commit()
        self.db.refresh(service)
        return service

    def update_service(
        self,
        service_uuid: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        image: Optional[str] = None,
        category_id: Optional[UUID] = None,
    ) -> Service:
        service = self.db.query(Service).filter(Service.uuid == service_uuid).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found.")
        if name and name != service.name:
            conflict = self.db.query(Service).filter(
                func.lower(Service.name) == func.lower(name),
                Service.uuid != service_uuid,
            ).first()
            if conflict:
                raise HTTPException(status_code=409, detail=f"Service '{name}' already exists.")
            service.name = name  # type: ignore[assignment]
        if description is not None:
            service.description = description  # type: ignore[assignment]
        if image is not None:
            service.image = image  # type: ignore[assignment]
        if category_id is not None:
            cat = self.db.query(Category).filter(Category.uuid == category_id).first()
            if not cat:
                raise HTTPException(status_code=404, detail="Category not found.")
            service.category_id = category_id  # type: ignore[assignment]
        self.db.commit()
        self.db.refresh(service)
        return service

    def delete_service(self, service_uuid: UUID) -> None:
        service = self.db.query(Service).filter(Service.uuid == service_uuid).first()
        if not service:
            raise HTTPException(status_code=404, detail="Service not found.")
        self.db.delete(service)
        self.db.commit()
