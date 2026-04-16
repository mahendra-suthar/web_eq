from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.context import RequestContext
from app.db.database import get_db
from app.controllers.admin_controller import AdminController
from app.schemas.super_admin import (
    BusinessAdminResponse,
    BusinessListResponse,
    BusinessStatusUpdate,
    ImpersonationResponse,
)

businesses_router = APIRouter()


@businesses_router.get("", response_model=BusinessListResponse)
def list_businesses(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    status: Optional[int] = Query(None, ge=0, le=5),
    db: Session = Depends(get_db),
):
    return AdminController(db).list_businesses(page, limit, search, status)


@businesses_router.post("/{business_uuid}/impersonate", response_model=ImpersonationResponse)
def impersonate_business(
    business_uuid: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    admin = RequestContext.get_user()
    return AdminController(db).impersonate_business(business_uuid, admin.uuid)


@businesses_router.patch("/{business_uuid}/status", response_model=BusinessAdminResponse)
def update_business_status(
    business_uuid: UUID,
    data: BusinessStatusUpdate,
    db: Session = Depends(get_db),
):
    return AdminController(db).update_business_status(business_uuid, data)
