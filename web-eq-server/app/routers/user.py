from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.user import UserData
from app.db.database import get_db
from app.controllers.user_controller import UserController
from app.middleware.permissions import require_roles

user_router = APIRouter()


@user_router.get("/get_users", response_model=list[UserData], dependencies=[Depends(require_roles(["ADMIN"]))])
async def get_users(page: int = 1, limit: int = 10, search: str | None = None, db: Session = Depends(get_db)):
    controller = UserController(db)
    return await controller.get_users(page, limit, search)