from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.admin_controller import AdminController
from app.schemas.super_admin import (
    ServiceAdminResponse,
    ServiceCreate,
    ServiceListResponse,
    ServiceUpdate,
)

services_router = APIRouter()


@services_router.get("", response_model=ServiceListResponse)
def list_services(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    category_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    return AdminController(db).list_services(page, limit, search, category_id)


@services_router.post("", response_model=ServiceAdminResponse, status_code=status.HTTP_201_CREATED)
def create_service(data: ServiceCreate, db: Session = Depends(get_db)):
    return AdminController(db).create_service(data)


@services_router.put("/{service_uuid}", response_model=ServiceAdminResponse)
def update_service(service_uuid: UUID, data: ServiceUpdate, db: Session = Depends(get_db)):
    return AdminController(db).update_service(service_uuid, data)


@services_router.delete("/{service_uuid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(service_uuid: UUID, db: Session = Depends(get_db)):
    AdminController(db).delete_service(service_uuid)
