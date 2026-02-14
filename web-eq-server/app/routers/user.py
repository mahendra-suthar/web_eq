from uuid import UUID
from fastapi import APIRouter, Depends, Query
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
    db: Session = Depends(get_db),
):
    """Get unique users who have created appointments. Provide exactly one of business_id or queue_id."""
    controller = UserController(db)
    return controller.get_users_appointments(
        business_id=business_id,
        queue_id=queue_id,
        page=page,
        limit=limit,
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
    """Get complete user information and queue-wise appointment summary. Returns 404 if user not found."""
    controller = UserController(db)
    return controller.get_user_detail(user_id)