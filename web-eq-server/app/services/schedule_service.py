import logging
from dataclasses import dataclass
from datetime import date as date_type
from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from uuid import UUID
from typing import List, Dict, Tuple, Optional

from app.models.schedule import Schedule, ScheduleBreak, ScheduleException, ScheduleEntityType
from app.models.business import Business
from app.schemas.schedule import ScheduleInput, BreakTimeInput, ScheduleExceptionCreate, ScheduleExceptionUpdate
from app.core.constants import BIZ_EARLIEST_TIME, BIZ_LATEST_TIME

logger = logging.getLogger(__name__)


class ScheduleService:
    def __init__(self, db: Session):
        self.db = db

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule queries
    # ──────────────────────────────────────────────────────────────────────────

    def get_schedule_for_entity_day(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        day_of_week: int,
    ) -> Optional[Schedule]:
        """Return the open schedule row (with breaks eagerly loaded) for one day."""
        try:
            return (
                self.db.query(Schedule)
                .options(joinedload(Schedule.breaks))
                .filter(
                    Schedule.entity_id == entity_id,
                    Schedule.entity_type == entity_type,
                    Schedule.day_of_week == day_of_week,
                    Schedule.is_open == True,
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_schedule_for_entity_day (entity_id=%s day=%s)", entity_id, day_of_week)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_schedule_with_breaks_for_day(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        day_of_week: int,
    ) -> Optional[Schedule]:
        """Return the schedule row (with breaks eagerly loaded) for one day, regardless of is_open.
        Use this when you need to know whether the entity is *explicitly* closed that day."""
        try:
            return (
                self.db.query(Schedule)
                .options(joinedload(Schedule.breaks))
                .filter(
                    Schedule.entity_id == entity_id,
                    Schedule.entity_type == entity_type,
                    Schedule.day_of_week == day_of_week,
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_schedule_with_breaks_for_day (entity_id=%s day=%s)", entity_id, day_of_week)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_schedules_with_breaks_batch(
        self,
        entity_ids: List[UUID],
        entity_type: ScheduleEntityType,
        day_of_week: int,
    ) -> Dict[UUID, Schedule]:
        """Batch fetch schedules (with breaks eagerly loaded) for multiple entities on one day.

        Returns a dict keyed by entity_id. One SELECT + one IN-subquery for breaks —
        eliminates N per-entity queries when processing a list of queues.
        """
        if not entity_ids:
            return {}
        try:
            rows = (
                self.db.query(Schedule)
                .options(joinedload(Schedule.breaks))
                .filter(
                    Schedule.entity_id.in_(entity_ids),
                    Schedule.entity_type == entity_type,
                    Schedule.day_of_week == day_of_week,
                )
                .all()
            )
            return {row.entity_id: row for row in rows}  # type: ignore[return-value]
        except Exception:
            logger.exception("Failed to get_schedules_with_breaks_batch (entity_type=%s day=%s)", entity_type, day_of_week)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exceptions_for_schedules_batch(
        self,
        schedule_ids: List[UUID],
        exception_date: date_type,
    ) -> Dict[UUID, ScheduleException]:
        """Batch fetch schedule exceptions for multiple schedules on one date.

        Returns a dict keyed by schedule_id. One SELECT with IN clause —
        eliminates N per-schedule queries when processing a list of queues.
        """
        if not schedule_ids:
            return {}
        try:
            rows = (
                self.db.query(ScheduleException)
                .filter(
                    ScheduleException.schedule_id.in_(schedule_ids),
                    ScheduleException.exception_date == exception_date,
                )
                .all()
            )
            return {row.schedule_id: row for row in rows}  # type: ignore[return-value]
        except Exception:
            logger.exception("Failed to get_exceptions_for_schedules_batch (date=%s)", exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_schedules_by_entity(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> List[Schedule]:
        try:
            return (
                self.db.query(Schedule)
                .filter(
                    Schedule.entity_id == entity_id,
                    Schedule.entity_type == entity_type,
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_schedules_by_entity (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_schedules_with_breaks(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> List[Schedule]:
        """Return all schedule rows with their breaks eagerly loaded."""
        try:
            return (
                self.db.query(Schedule)
                .options(joinedload(Schedule.breaks))
                .filter(
                    Schedule.entity_id == entity_id,
                    Schedule.entity_type == entity_type,
                )
                .all()
            )
        except Exception:
            logger.exception("Failed to get_schedules_with_breaks (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_business_schedule_data_for_validation(
        self, business_id: UUID
    ) -> Tuple[bool, Dict[int, Schedule]]:
        try:
            business = self.db.query(Business).filter(Business.uuid == business_id).first()
            if not business:
                return False, {}
            is_always_open = bool(getattr(business, "is_always_open", False))
            business_schedules = self.get_schedules_by_entity(business_id, ScheduleEntityType.BUSINESS)
            by_day: Dict[int, Schedule] = {s.day_of_week: s for s in business_schedules}  # type: ignore[index]
            return is_always_open, by_day
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_schedule_data_for_validation (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule CRUD
    # ──────────────────────────────────────────────────────────────────────────

    def delete_schedules_by_entity(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> None:
        """Delete all schedule rows (and their breaks via CASCADE) for an entity."""
        try:
            self.db.query(Schedule).filter(
                Schedule.entity_id == entity_id,
                Schedule.entity_type == entity_type,
            ).delete()
        except Exception:
            logger.exception("Failed to delete_schedules_by_entity (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def replace_schedules_for_entity(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        schedules: List[ScheduleInput],
    ) -> List[Schedule]:
        try:
            self.delete_schedules_by_entity(entity_id, entity_type)

            if not schedules:
                return []

            new_schedules: List[Schedule] = []
            for s in schedules:
                schedule = Schedule(
                    entity_id=entity_id,
                    entity_type=entity_type,
                    day_of_week=s.day_of_week,
                    opening_time=s.opening_time,
                    closing_time=s.closing_time,
                    is_open=s.is_open,
                )
                self.db.add(schedule)
                new_schedules.append(schedule)
            self.db.flush()  # populate uuid for all schedules in one round-trip

            # Create breaks (need schedule.uuid from flush)
            for schedule, s in zip(new_schedules, schedules):
                for br in s.break_times:
                    self.db.add(
                        ScheduleBreak(
                            schedule_id=schedule.uuid,
                            break_start=br.break_start,
                            break_end=br.break_end,
                        )
                    )

            self.db.commit()
            return new_schedules
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to replace_schedules_for_entity (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})


    def copy_business_schedule_to_employees(
        self, business_id: UUID, employee_ids: List[UUID]
    ) -> List[Schedule]:
        if not employee_ids:
            return []
        business_schedules = self.get_schedules_with_breaks(
            business_id, ScheduleEntityType.BUSINESS
        )
        if not business_schedules:
            business = self.db.query(Business).filter(Business.uuid == business_id).first()
            if business and getattr(business, "is_always_open", False):

                @dataclass
                class _AlwaysOpenDay:
                    day_of_week: int
                    opening_time: object
                    closing_time: object
                    is_open: bool
                    breaks: list

                business_schedules = [
                    _AlwaysOpenDay(d, BIZ_EARLIEST_TIME, BIZ_LATEST_TIME, True, [])
                    for d in range(7)
                ]
            else:
                return []

        new_schedules: List[Schedule] = []
        for emp_id in employee_ids:
            for s in business_schedules:
                emp_schedule = Schedule(
                    entity_id=emp_id,
                    entity_type=ScheduleEntityType.EMPLOYEE,
                    day_of_week=s.day_of_week,
                    opening_time=s.opening_time,
                    closing_time=s.closing_time,
                    is_open=s.is_open,
                )
                self.db.add(emp_schedule)
                self.db.flush()
                for br in s.breaks:
                    self.db.add(ScheduleBreak(
                        schedule_id=emp_schedule.uuid,
                        break_start=br.break_start,
                        break_end=br.break_end,
                    ))
                new_schedules.append(emp_schedule)
        return new_schedules

    # ──────────────────────────────────────────────────────────────────────────
    # ScheduleBreak CRUD
    # ──────────────────────────────────────────────────────────────────────────

    def get_breaks_for_schedule(self, schedule_id: UUID) -> List[ScheduleBreak]:
        try:
            return (
                self.db.query(ScheduleBreak)
                .filter(ScheduleBreak.schedule_id == schedule_id)
                .order_by(ScheduleBreak.break_start)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_breaks_for_schedule (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_schedule_breaks(
        self, schedule_id: UUID, break_times: List[BreakTimeInput]
    ) -> List[ScheduleBreak]:
        try:
            new_breaks = [
                ScheduleBreak(
                    schedule_id=schedule_id,
                    break_start=br.break_start,
                    break_end=br.break_end,
                )
                for br in break_times
            ]
            self.db.add_all(new_breaks)
            self.db.flush()
            return new_breaks
        except Exception:
            logger.exception("Failed to create_schedule_breaks (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def delete_breaks_for_schedule(self, schedule_id: UUID) -> None:
        try:
            self.db.execute(
                delete(ScheduleBreak).where(ScheduleBreak.schedule_id == schedule_id)
            )
        except Exception:
            logger.exception("Failed to delete_breaks_for_schedule (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ──────────────────────────────────────────────────────────────────────────
    # ScheduleException CRUD
    # ──────────────────────────────────────────────────────────────────────────

    def get_exceptions_for_schedule(self, schedule_id: UUID) -> List[ScheduleException]:
        try:
            return (
                self.db.query(ScheduleException)
                .filter(ScheduleException.schedule_id == schedule_id)
                .order_by(ScheduleException.exception_date)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_exceptions_for_schedule (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exception_for_date(
        self, schedule_id: UUID, exception_date: date_type
    ) -> Optional[ScheduleException]:
        try:
            return (
                self.db.query(ScheduleException)
                .filter(
                    ScheduleException.schedule_id == schedule_id,
                    ScheduleException.exception_date == exception_date,
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_exception_for_date (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exception_for_entity_date(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        lookup_date: date_type,
    ) -> Optional[ScheduleException]:
        try:
            day_of_week = (lookup_date.weekday() + 1) % 7
            schedule = (
                self.db.query(Schedule)
                .filter(
                    Schedule.entity_id == entity_id,
                    Schedule.entity_type == entity_type,
                    Schedule.day_of_week == day_of_week,
                )
                .first()
            )
            if not schedule:
                return None
            return self.get_exception_for_date(schedule.uuid, lookup_date)  # type: ignore[arg-type]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_exception_for_entity_date (entity_id=%s date=%s)", entity_id, lookup_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_schedule_exception(
        self, data: ScheduleExceptionCreate
    ) -> ScheduleException:
        existing = self.get_exception_for_date(data.schedule_id, data.exception_date)
        if existing:
            raise ValueError(
                f"An exception already exists for date {data.exception_date} "
                f"on schedule {data.schedule_id}"
            )
        try:
            exc = ScheduleException(
                schedule_id=data.schedule_id,
                exception_date=data.exception_date,
                special_opening_time=data.special_opening_time,
                special_closing_time=data.special_closing_time,
                is_closed=data.is_closed,
            )
            self.db.add(exc)
            self.db.commit()
            return exc
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_schedule_exception (schedule_id=%s date=%s)", data.schedule_id, data.exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type, data: ScheduleExceptionUpdate
    ) -> ScheduleException:
        exc = self.get_exception_for_date(schedule_id, exception_date)
        if not exc:
            raise ValueError(
                f"No exception found for date {exception_date} on schedule {schedule_id}"
            )
        try:
            payload = data.model_dump(exclude_unset=True)
            for key, val in payload.items():
                setattr(exc, key, val)
            self.db.commit()
            return exc
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def delete_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type
    ) -> bool:
        exc = self.get_exception_for_date(schedule_id, exception_date)
        if not exc:
            return False
        try:
            self.db.delete(exc)
            self.db.commit()
            return True
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

