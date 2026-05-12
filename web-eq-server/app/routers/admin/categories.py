from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.admin_controller import AdminController
from app.schemas.super_admin import (
    CategoryAdminResponse,
    CategoryCreate,
    CategoryListResponse,
    CategoryUpdate,
)

categories_router = APIRouter()


@categories_router.get("", response_model=CategoryListResponse)
def list_categories(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=500),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return AdminController(db).list_categories(page, limit, search)


@categories_router.post("", response_model=CategoryAdminResponse, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    return AdminController(db).create_category(data)


@categories_router.put("/{category_uuid}", response_model=CategoryAdminResponse)
def update_category(category_uuid: UUID, data: CategoryUpdate, db: Session = Depends(get_db)):
    return AdminController(db).update_category(category_uuid, data)


@categories_router.delete("/{category_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_uuid: UUID, db: Session = Depends(get_db)):
    AdminController(db).delete_category(category_uuid)
