import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.services.role_service import RoleService
from app.models.role import UserRoles, Role

logger = logging.getLogger(__name__)


class RoleController:
    def __init__(self, db: Session):
        self.db = db
        self.role_service = RoleService(db)

    def get_or_create_role(self, name: str, description: Optional[str] = None) -> Role:
        try:
            role = self.role_service.get_role_by_name(name)
            if not role:
                role = self.role_service.create_role(name, description)
            return role
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_or_create_role (name=%s)", name)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def assign_role_to_user(self, user_id: uuid.UUID, role_name: str) -> UserRoles:
        try:
            role = self.get_or_create_role(role_name)
            existing_user_role = self.role_service.get_user_role(user_id, role.uuid)  # type: ignore[arg-type]
            if existing_user_role:
                return existing_user_role
            return self.role_service.create_user_role(user_id, role.uuid)  # type: ignore[arg-type]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to assign_role_to_user (role=%s user_id=%s)", role_name, user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def check_user_has_role(self, user_id: uuid.UUID, role_name: str) -> bool:
        try:
            role = self.role_service.get_role_by_name(role_name)
            if not role:
                return False
            user_role = self.role_service.get_user_role(user_id, role.uuid)  # type: ignore[arg-type]
            return user_role is not None
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to check_user_has_role (role=%s user_id=%s)", role_name, user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_user_roles(self, user_id: uuid.UUID) -> list[UserRoles]:
        try:
            return self.role_service.get_user_roles(user_id)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_user_roles (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
