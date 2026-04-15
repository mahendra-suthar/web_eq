"""
Admin controller — thin orchestration layer between admin routers and services.
Handles response shaping so routers stay free of business logic.
"""
import math
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.constants import BUSINESS_STATUS_LABELS
from app.services.admin_service import AdminService
from app.services.category_service import CategoryService
from app.services.service_service import ServiceService
from app.schemas.super_admin import (
    AdminStats,
    BusinessAdminResponse, BusinessListResponse, BusinessStatusUpdate,
    CategoryAdminResponse, CategoryCreate, CategoryListResponse, CategoryUpdate,
    ServiceAdminResponse, ServiceCreate, ServiceListResponse, ServiceUpdate,
    UserAdminResponse, UserListResponse, UserRoleAssign, UserRoleRevoke,
)


class AdminController:
    def __init__(self, db: Session):
        self.db = db
        self.admin_svc = AdminService(db)
        self.category_svc = CategoryService(db)
        self.service_svc = ServiceService(db)

    # ── Stats ─────────────────────────────────────────────────────────────────

    def get_stats(self) -> AdminStats:
        return AdminStats(**self.admin_svc.get_stats())

    # ── Categories ────────────────────────────────────────────────────────────

    def list_categories(
        self, page: int, limit: int, search: Optional[str]
    ) -> CategoryListResponse:
        rows, total = self.category_svc.get_admin_categories_page(page, limit, search)
        items = [
            CategoryAdminResponse(
                uuid=str(r.uuid),
                name=str(r.name),
                description=str(r.description) if r.description else None,
                image=str(r.image) if r.image else None,
                parent_category_id=str(r.parent_category_id) if r.parent_category_id else None,
                subcategories_count=int(r.subcategories_count),
                services_count=int(r.services_count),
                businesses_count=int(r.businesses_count),
            )
            for r in rows
        ]
        return CategoryListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total else 1,
        )

    def create_category(self, data: CategoryCreate) -> CategoryAdminResponse:
        cat = self.category_svc.create_category(
            name=data.name,
            description=data.description,
            image=data.image,
            parent_category_id=data.parent_category_id,
        )
        return CategoryAdminResponse(
            uuid=str(cat.uuid),
            name=str(cat.name),
            description=str(cat.description) if cat.description else None,
            image=str(cat.image) if cat.image else None,
            parent_category_id=str(cat.parent_category_id) if cat.parent_category_id else None,
        )

    def update_category(self, category_uuid: UUID, data: CategoryUpdate) -> CategoryAdminResponse:
        cat = self.category_svc.update_category(
            category_uuid=category_uuid,
            name=data.name,
            description=data.description,
            image=data.image,
            parent_category_id=data.parent_category_id,
        )
        return CategoryAdminResponse(
            uuid=str(cat.uuid),
            name=str(cat.name),
            description=str(cat.description) if cat.description else None,
            image=str(cat.image) if cat.image else None,
            parent_category_id=str(cat.parent_category_id) if cat.parent_category_id else None,
        )

    def delete_category(self, category_uuid: UUID) -> None:
        self.category_svc.delete_category(category_uuid)

    # ── Services ──────────────────────────────────────────────────────────────

    def list_services(
        self,
        page: int,
        limit: int,
        search: Optional[str],
        category_id: Optional[UUID],
    ) -> ServiceListResponse:
        rows, total = self.service_svc.get_admin_services_page(page, limit, search, category_id)
        items = [
            ServiceAdminResponse(
                uuid=str(r.uuid),
                name=str(r.name),
                description=str(r.description) if r.description else None,
                image=str(r.image) if r.image else None,
                category_id=str(r.category_id) if r.category_id else None,
                category_name=str(r.category_name) if r.category_name else None,
            )
            for r in rows
        ]
        return ServiceListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total else 1,
        )

    def create_service(self, data: ServiceCreate) -> ServiceAdminResponse:
        svc = self.service_svc.create_service(
            name=data.name,
            description=data.description,
            image=data.image,
            category_id=data.category_id,
        )
        return ServiceAdminResponse(
            uuid=str(svc.uuid),
            name=str(svc.name),
            description=str(svc.description) if svc.description else None,
            image=str(svc.image) if svc.image else None,
            category_id=str(svc.category_id) if svc.category_id else None,
        )

    def update_service(self, service_uuid: UUID, data: ServiceUpdate) -> ServiceAdminResponse:
        svc = self.service_svc.update_service(
            service_uuid=service_uuid,
            name=data.name,
            description=data.description,
            image=data.image,
            category_id=data.category_id,
        )
        return ServiceAdminResponse(
            uuid=str(svc.uuid),
            name=str(svc.name),
            description=str(svc.description) if svc.description else None,
            image=str(svc.image) if svc.image else None,
            category_id=str(svc.category_id) if svc.category_id else None,
        )

    def delete_service(self, service_uuid: UUID) -> None:
        self.service_svc.delete_service(service_uuid)

    # ── Businesses ────────────────────────────────────────────────────────────

    def list_businesses(
        self,
        page: int,
        limit: int,
        search: Optional[str],
        status: Optional[int],
    ) -> BusinessListResponse:
        rows, total = self.admin_svc.get_businesses_page(page, limit, search, status)
        items = [
            BusinessAdminResponse(
                uuid=str(r.uuid),
                name=str(r.name),
                email=str(r.email) if r.email else None,
                phone_number=str(r.phone_number),
                status=int(r.status) if r.status is not None else 0,
                status_label=BUSINESS_STATUS_LABELS.get(int(r.status) if r.status is not None else 0, "Unknown"),
                category_id=str(r.category_id) if r.category_id else None,
                category_name=str(r.category_name) if r.category_name else None,
                owner_name=str(r.owner_name) if r.owner_name else None,
                owner_phone=str(r.owner_phone) if r.owner_phone else None,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
            for r in rows
        ]
        return BusinessListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total else 1,
        )

    def update_business_status(self, business_uuid: UUID, data: BusinessStatusUpdate) -> BusinessAdminResponse:
        biz = self.admin_svc.update_business_status(business_uuid, data.status)
        return BusinessAdminResponse(
            uuid=str(biz.uuid),
            name=str(biz.name),
            email=str(biz.email) if biz.email else None,
            phone_number=str(biz.phone_number),
            status=int(biz.status),  # type: ignore[arg-type]
            status_label=BUSINESS_STATUS_LABELS.get(int(biz.status), "Unknown"),  # type: ignore[arg-type]
            category_id=str(biz.category_id) if biz.category_id else None,
            owner_name=str(biz.owner.full_name) if biz.owner and biz.owner.full_name else None,
            owner_phone=str(biz.owner.phone_number) if biz.owner else None,
            created_at=biz.created_at.isoformat() if biz.created_at else "",  # type: ignore[union-attr]
        )

    # ── Users ─────────────────────────────────────────────────────────────────

    def list_users(
        self, page: int, limit: int, search: Optional[str]
    ) -> UserListResponse:
        users, total = self.admin_svc.get_users_page(page, limit, search)
        items = [
            UserAdminResponse(
                uuid=str(u.uuid),
                full_name=str(u.full_name) if u.full_name else None,
                phone_number=str(u.phone_number),
                email=str(u.email) if u.email else None,
                roles=[ur.role.name for ur in u.roles if ur.role],
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
            for u in users
        ]
        return UserListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            pages=math.ceil(total / limit) if total else 1,
        )

    def assign_user_role(self, user_uuid: UUID, data: UserRoleAssign) -> None:
        self.admin_svc.assign_role(user_uuid, data.role.value)

    def revoke_user_role(self, user_uuid: UUID, data: UserRoleRevoke) -> None:
        self.admin_svc.revoke_role(user_uuid, data.role.value)
