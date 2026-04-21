"""
Super Admin schemas — request bodies and response models for all admin endpoints.
Kept separate from public schemas to avoid polluting them with admin-only fields.
"""
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field

from app.core.constants import AppRole, BUSINESS_DRAFT, BUSINESS_TERMINATED


# ── Category ──────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[UUID] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[UUID] = None


class CategoryAdminResponse(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    parent_category_id: Optional[str] = None
    subcategories_count: int = 0
    services_count: int = 0
    businesses_count: int = 0


class CategoryListResponse(BaseModel):
    items: List[CategoryAdminResponse]
    total: int
    page: int
    limit: int
    pages: int


# ── Service ───────────────────────────────────────────────────────────────────

class ServiceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    image: Optional[str] = None
    category_id: Optional[UUID] = None


class ServiceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    image: Optional[str] = None
    category_id: Optional[UUID] = None


class ServiceAdminResponse(BaseModel):
    uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None


class ServiceListResponse(BaseModel):
    items: List[ServiceAdminResponse]
    total: int
    page: int
    limit: int
    pages: int


# ── Business ──────────────────────────────────────────────────────────────────

class BusinessAdminResponse(BaseModel):
    uuid: str
    name: str
    email: Optional[str] = None
    phone_number: str
    status: int
    status_label: str
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    created_at: str


class BusinessStatusUpdate(BaseModel):
    status: int = Field(
        ..., ge=BUSINESS_DRAFT, le=BUSINESS_TERMINATED,
        description="0=DRAFT, 1=REGISTERED, 2=ACTIVE, 3=SUSPENDED, 4=INACTIVE, 5=TERMINATED"
    )


class BusinessListResponse(BaseModel):
    items: List[BusinessAdminResponse]
    total: int
    page: int
    limit: int
    pages: int


# ── User ──────────────────────────────────────────────────────────────────────

class UserAdminResponse(BaseModel):
    uuid: str
    full_name: Optional[str] = None
    phone_number: str
    email: Optional[str] = None
    roles: List[str] = []
    created_at: str


class UserRoleAssign(BaseModel):
    role: AppRole = Field(..., description="Role name: ADMIN, BUSINESS, EMPLOYEE, CUSTOMER")


class UserRoleRevoke(BaseModel):
    role: AppRole = Field(..., description="Role name to revoke")


class UserListResponse(BaseModel):
    items: List[UserAdminResponse]
    total: int
    page: int
    limit: int
    pages: int


# ── Impersonation ─────────────────────────────────────────────────────────────

class ImpersonationResponse(BaseModel):
    token: str
    business_name: str
    business_uuid: str
    expires_at: str


# ── Stats ─────────────────────────────────────────────────────────────────────

class AdminStats(BaseModel):
    total_users: int
    total_businesses: int
    active_businesses: int
    total_categories: int
    total_services: int
    total_queues: int
    total_appointments: int
