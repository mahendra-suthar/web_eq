"""
Admin-specific service: business status management, user role management, platform stats.
Keeps admin-only logic out of the domain services used by public routes.
"""
import logging
from typing import Any, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.models.business import Business
from app.models.category import Category
from app.models.queue import Queue, QueueUser
from app.models.role import Role, UserRoles
from app.models.service import Service
from app.models.user import User
from app.core.constants import (
    BUSINESS_ACTIVE,
    BUSINESS_STATUS_LABELS,
)

logger = logging.getLogger(__name__)


class AdminService:
    def __init__(self, db: Session):
        self.db = db

    # ── Business management ───────────────────────────────────────────────────

    def get_businesses_page(
        self,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
        status: Optional[int] = None,
    ) -> Tuple[List[Any], int]:
        try:
            q = (
                self.db.query(
                    Business.uuid,
                    Business.name,
                    Business.email,
                    Business.phone_number,
                    Business.status,
                    Business.category_id,
                    Category.name.label("category_name"),
                    User.full_name.label("owner_name"),
                    User.phone_number.label("owner_phone"),
                    Business.created_at,
                )
                .outerjoin(Category, Category.uuid == Business.category_id)
                .outerjoin(User, User.uuid == Business.owner_id)
            )
            if search:
                q = q.filter(Business.name.ilike(f"%{search}%"))
            if status is not None:
                q = q.filter(Business.status == status)
            total: int = q.count()
            offset = (page - 1) * limit
            rows = q.order_by(Business.created_at.desc()).offset(offset).limit(limit).all()
            return rows, total
        except Exception:
            logger.exception("Failed to get_businesses_page (page=%s search=%s)", page, search)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_business_status(self, business_uuid: UUID, status: int) -> Business:
        try:
            business = self.db.query(Business).filter(Business.uuid == business_uuid).first()
            if not business:
                raise HTTPException(status_code=404, detail={"message": "Business not found."})
            if status not in BUSINESS_STATUS_LABELS:
                raise HTTPException(status_code=400, detail={"message": "Invalid status value."})
            business.status = status  # type: ignore[assignment]
            self.db.commit()
            self.db.refresh(business)
            return business
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_business_status (uuid=%s status=%s)", business_uuid, status)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ── User management ───────────────────────────────────────────────────────

    def get_users_page(
        self,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
    ) -> Tuple[List[Any], int]:
        try:
            q = self.db.query(User)
            if search:
                pattern = f"%{search}%"
                q = q.filter(
                    or_(
                        User.full_name.ilike(pattern),
                        User.phone_number.ilike(pattern),
                        User.email.ilike(pattern),
                    )
                )
            total: int = q.count()
            offset = (page - 1) * limit
            rows = (
                q.options(selectinload(User.roles).selectinload(UserRoles.role))
                .order_by(User.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return rows, total
        except Exception:
            logger.exception("Failed to get_users_page (page=%s search=%s)", page, search)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def assign_role(self, user_uuid: UUID, role_name: str) -> None:
        try:
            user = self.db.query(User).filter(User.uuid == user_uuid).first()
            if not user:
                raise HTTPException(status_code=404, detail={"message": "User not found."})
            role = self.db.query(Role).filter(func.upper(Role.name) == role_name.upper()).first()
            if not role:
                role = Role(name=role_name.upper(), description=f"{role_name.upper()} role")
                self.db.add(role)
                self.db.flush()
            existing = self.db.query(UserRoles).filter(
                UserRoles.user_id == user_uuid,
                UserRoles.role_id == role.uuid,
            ).first()
            if not existing:
                user_role = UserRoles(user_id=user_uuid, role_id=role.uuid)
                self.db.add(user_role)
                self.db.commit()
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to assign_role (user_uuid=%s role=%s)", user_uuid, role_name)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def revoke_role(self, user_uuid: UUID, role_name: str) -> None:
        try:
            user = self.db.query(User).filter(User.uuid == user_uuid).first()
            if not user:
                raise HTTPException(status_code=404, detail={"message": "User not found."})
            role = self.db.query(Role).filter(func.upper(Role.name) == role_name.upper()).first()
            if not role:
                raise HTTPException(status_code=404, detail={"message": f"Role '{role_name}' not found."})
            user_role = self.db.query(UserRoles).filter(
                UserRoles.user_id == user_uuid,
                UserRoles.role_id == role.uuid,
            ).first()
            if user_role:
                self.db.delete(user_role)
                self.db.commit()
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to revoke_role (user_uuid=%s role=%s)", user_uuid, role_name)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ── Impersonation ─────────────────────────────────────────────────────────

    def get_business_by_uuid(self, business_uuid: UUID) -> Optional[Business]:
        try:
            return (
                self.db.query(Business)
                .filter(Business.uuid == business_uuid)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_business_by_uuid (uuid=%s)", business_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ── Platform stats ────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        try:
            total_users: int = self.db.query(func.count(User.uuid)).scalar() or 0
            total_businesses: int = self.db.query(func.count(Business.uuid)).scalar() or 0
            active_businesses: int = (
                self.db.query(func.count(Business.uuid))
                .filter(Business.status == BUSINESS_ACTIVE)
                .scalar() or 0
            )
            total_categories: int = self.db.query(func.count(Category.uuid)).scalar() or 0
            total_services: int = self.db.query(func.count(Service.uuid)).scalar() or 0
            total_queues: int = self.db.query(func.count(Queue.uuid)).scalar() or 0
            total_appointments: int = self.db.query(func.count(QueueUser.uuid)).scalar() or 0
            return {
                "total_users": total_users,
                "total_businesses": total_businesses,
                "active_businesses": active_businesses,
                "total_categories": total_categories,
                "total_services": total_services,
                "total_queues": total_queues,
                "total_appointments": total_appointments,
            }
        except Exception:
            logger.exception("Failed to get_stats")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
