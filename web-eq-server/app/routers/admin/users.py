from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.admin_controller import AdminController
from app.schemas.super_admin import (
    UserListResponse,
    UserRoleAssign,
    UserRoleRevoke,
)

users_router = APIRouter()


@users_router.get("", response_model=UserListResponse)
def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return AdminController(db).list_users(page, limit, search)


@users_router.post("/{user_uuid}/roles", status_code=status.HTTP_204_NO_CONTENT)
def assign_role(user_uuid: UUID, data: UserRoleAssign, db: Session = Depends(get_db)):
    AdminController(db).assign_user_role(user_uuid, data)


@users_router.post("/{user_uuid}/roles/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_role(user_uuid: UUID, data: UserRoleRevoke, db: Session = Depends(get_db)):
    AdminController(db).revoke_user_role(user_uuid, data)
