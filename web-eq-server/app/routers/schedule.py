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
    ScheduleExceptionCreate, ScheduleExceptionByDateCreate,
    ScheduleExceptionRangeCreate, LeaveBatchResult,
    ScheduleExceptionData, ScheduleExceptionUpdate,
    ScheduleExceptionReview, PendingLeaveData,
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
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_schedule_exceptions(schedule_id, user)


@schedule_router.post("/schedule_exception", response_model=ScheduleExceptionData)
async def create_schedule_exception(
    payload: ScheduleExceptionCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedule_exception(payload, user)


@schedule_router.post("/schedule_exception/by_date", response_model=ScheduleExceptionData)
async def create_schedule_exception_by_date(
    payload: ScheduleExceptionByDateCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedule_exception_by_date(payload, user)


@schedule_router.post("/schedule_exception/range", response_model=LeaveBatchResult)
async def create_schedule_exception_range(
    payload: ScheduleExceptionRangeCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.create_schedule_exception_range(payload, user)


@schedule_router.post("/schedule_exception/group/{group_id}/review", response_model=LeaveBatchResult)
async def review_leave_group(
    group_id: UUID,
    payload: ScheduleExceptionReview,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.review_leave_group(group_id, payload.approve, user)


@schedule_router.delete("/schedule_exception/group/{group_id}")
async def delete_leave_group(
    group_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.delete_leave_group(group_id, user)


@schedule_router.get(
    "/schedule_exceptions/pending",
    response_model=List[PendingLeaveData],
)
async def get_pending_schedule_exceptions(
    business_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_pending_exceptions(business_id, user)


@schedule_router.get(
    "/schedule_exceptions/business",
    response_model=List[PendingLeaveData],
)
async def get_business_schedule_leaves(
    business_id: UUID,
    scope: str = "upcoming",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_business_leaves(business_id, user, scope)


@schedule_router.get(
    "/schedule_exceptions/my",
    response_model=List[ScheduleExceptionData],
)
async def get_my_schedule_exceptions(
    scope: str = "upcoming",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.get_my_exceptions(user, scope)


@schedule_router.post(
    "/schedule_exception/{exception_id}/review",
    response_model=ScheduleExceptionData,
)
async def review_schedule_exception(
    exception_id: UUID,
    payload: ScheduleExceptionReview,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.review_schedule_exception(exception_id, payload.approve, user)


@schedule_router.put(
    "/schedule_exception/{schedule_id}/{exception_date}",
    response_model=ScheduleExceptionData,
)
async def update_schedule_exception(
    schedule_id: UUID,
    exception_date: date,
    payload: ScheduleExceptionUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.update_schedule_exception(schedule_id, exception_date, payload, user)


@schedule_router.delete("/schedule_exception/{schedule_id}/{exception_date}")
async def delete_schedule_exception(
    schedule_id: UUID,
    exception_date: date,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = ScheduleController(db)
    return await controller.delete_schedule_exception(schedule_id, exception_date, user)
