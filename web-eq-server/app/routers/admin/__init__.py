"""
Admin router package.

All routes are mounted under /api/admin/ and require ADMIN role.
The dependency is applied at the APIRouter level so every sub-router
inherits it automatically — no per-endpoint decoration needed.
"""
from fastapi import APIRouter, Depends

from app.middleware.permissions import require_roles
from app.routers.admin.categories import categories_router
from app.routers.admin.services import services_router
from app.routers.admin.businesses import businesses_router
from app.routers.admin.users import users_router
from app.routers.admin.stats import stats_router

admin_router = APIRouter(
    dependencies=[Depends(require_roles(["ADMIN"]))],
)

admin_router.include_router(stats_router, tags=["Admin - Stats"])
admin_router.include_router(categories_router, prefix="/categories", tags=["Admin - Categories"])
admin_router.include_router(services_router, prefix="/services", tags=["Admin - Services"])
admin_router.include_router(businesses_router, prefix="/businesses", tags=["Admin - Businesses"])
admin_router.include_router(users_router, prefix="/users", tags=["Admin - Users"])
