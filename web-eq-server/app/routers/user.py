from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.schemas.user import UserData, UsersAppointmentsResponse, UserDetailResponse
from app.db.database import get_db
from app.controllers.user_controller import UserController
from app.middleware.permissions import require_roles

user_router = APIRouter()
users_router = APIRouter()


@user_router.get(
    "/get_users",
    response_model=list[UserData],
    dependencies=[Depends(require_roles(["ADMIN", "BUSINESS", "EMPLOYEE"]))],
)
async def get_users(page: int = 1, limit: int = 10, search: str | None = None, db: Session = Depends(get_db)):
    controller = UserController(db)
    return await controller.get_users(page, limit, search)


@users_router.get(
    "/appointments",
    response_model=UsersAppointmentsResponse,
    dependencies=[Depends(require_roles(["ADMIN", "BUSINESS", "EMPLOYEE"]))],
)
def get_users_appointments(
    business_id: UUID | None = Query(None, description="Filter by business UUID"),
    queue_id: UUID | None = Query(None, description="Filter by queue UUID"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    controller = UserController(db)
    return controller.get_users_appointments(
        business_id=business_id,
        queue_id=queue_id,
        page=page,
        limit=limit,
        search=search,
    )


@users_router.get(
    "/appointments/export",
    dependencies=[Depends(require_roles(["ADMIN", "BUSINESS", "EMPLOYEE"]))],
)
def export_users_appointments(
    format: Literal["pdf", "xlsx"] = Query(..., description="Export format: pdf or xlsx"),
    business_id: UUID | None = Query(None, description="Filter by business UUID"),
    queue_id: UUID | None = Query(None, description="Filter by queue UUID"),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    controller = UserController(db)
    buf, media_type, filename = controller.export_users_appointments(
        fmt=format,
        business_id=business_id,
        queue_id=queue_id,
    )
    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@users_router.get(
    "/{user_id}",
    response_model=UserDetailResponse,
    dependencies=[Depends(require_roles(["ADMIN", "BUSINESS", "EMPLOYEE"]))],
)
def get_user_detail(
    user_id: UUID,
    db: Session = Depends(get_db),
):
    controller = UserController(db)
    return controller.get_user_detail(user_id)