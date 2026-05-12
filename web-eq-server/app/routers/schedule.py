from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.db.database import get_db
from app.controllers.schedule_controller import ScheduleController
from app.middleware.permissions import get_current_user
from app.models.user import User
from app.schemas.schedule import (
    ScheduleCreateInput, ScheduleData,
    ScheduleExceptionCreate, ScheduleExceptionData, ScheduleExceptionUpdate,
)


schedule_router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# Schedules
# ─────────────────────────────────────────────────────────────────────────────

@schedule_router.post("/create_schedules", response_model=List[ScheduleData])
async def create_schedules(
    payload: ScheduleCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedules(payload, user)


@schedule_router.get("/schedules/{entity_type}/{entity_id}", response_model=List[ScheduleData])
async def get_schedules(
    entity_type: str,
    entity_id: UUID,
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_schedules(entity_id, entity_type)


# ─────────────────────────────────────────────────────────────────────────────
# Schedule Exceptions
# ─────────────────────────────────────────────────────────────────────────────

@schedule_router.get(
    "/schedule/{schedule_id}/exceptions",
    response_model=List[ScheduleExceptionData],
)
async def get_schedule_exceptions(
    schedule_id: UUID,
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_schedule_exceptions(schedule_id)


@schedule_router.post("/schedule_exception", response_model=ScheduleExceptionData)
async def create_schedule_exception(
    payload: ScheduleExceptionCreate,
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedule_exception(payload)


@schedule_router.put(
    "/schedule_exception/{schedule_id}/{exception_date}",
    response_model=ScheduleExceptionData,
)
async def update_schedule_exception(
    schedule_id: UUID,
    exception_date: date,
    payload: ScheduleExceptionUpdate,
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.update_schedule_exception(schedule_id, exception_date, payload)


@schedule_router.delete("/schedule_exception/{schedule_id}/{exception_date}")
async def delete_schedule_exception(
    schedule_id: UUID,
    exception_date: date,
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.delete_schedule_exception(schedule_id, exception_date)
