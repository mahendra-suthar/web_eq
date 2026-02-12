from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.schedule_controller import ScheduleController
from app.middleware.permissions import get_current_user
from app.models.user import User
from app.schemas.schedule import ScheduleCreateInput, ScheduleData


schedule_router = APIRouter()


@schedule_router.post("/create_schedules", response_model=list[ScheduleData])
async def create_schedules(
    payload: ScheduleCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedules(payload, user)

