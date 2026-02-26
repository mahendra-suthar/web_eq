from datetime import date as date_type
from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import List, Dict, Tuple, Optional

from app.models.schedule import Schedule, ScheduleBreak, ScheduleException, ScheduleEntityType
from app.models.business import Business
from app.schemas.schedule import ScheduleInput, BreakTimeInput, ScheduleExceptionCreate, ScheduleExceptionUpdate


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

    def get_schedule_with_breaks_for_day(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        day_of_week: int,
    ) -> Optional[Schedule]:
        """Return the schedule row (with breaks eagerly loaded) for one day, regardless of is_open.
        Use this when you need to know whether the entity is *explicitly* closed that day."""
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

    def get_schedules_by_entity(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> List[Schedule]:
        return (
            self.db.query(Schedule)
            .filter(
                Schedule.entity_id == entity_id,
                Schedule.entity_type == entity_type,
            )
            .all()
        )

    def get_schedules_with_breaks(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> List[Schedule]:
        """Return all schedule rows with their breaks eagerly loaded."""
        return (
            self.db.query(Schedule)
            .options(joinedload(Schedule.breaks))
            .filter(
                Schedule.entity_id == entity_id,
                Schedule.entity_type == entity_type,
            )
            .all()
        )

    def get_business_schedule_data_for_validation(
        self, business_id: UUID
    ) -> Tuple[bool, Dict[int, Schedule]]:
        business = self.db.query(Business).filter(Business.uuid == business_id).first()
        if not business:
            return False, {}
        is_always_open = bool(getattr(business, "is_always_open", False))
        business_schedules = self.get_schedules_by_entity(business_id, ScheduleEntityType.BUSINESS)
        by_day: Dict[int, Schedule] = {s.day_of_week: s for s in business_schedules}
        return is_always_open, by_day

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule CRUD
    # ──────────────────────────────────────────────────────────────────────────

    def delete_schedules_by_entity(
        self, entity_id: UUID, entity_type: ScheduleEntityType
    ) -> None:
        """Delete all schedule rows (and their breaks via CASCADE) for an entity."""
        self.db.query(Schedule).filter(
            Schedule.entity_id == entity_id,
            Schedule.entity_type == entity_type,
        ).delete()

    def create_schedules_for_entity(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        schedules: List[ScheduleInput],
    ) -> List[Schedule]:
        """Delete existing schedules for the entity and create new ones. Commits the transaction. Returns created schedules."""
        self.delete_schedules_by_entity(entity_id, entity_type)
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
            self.db.flush()  # populate schedule.uuid before creating breaks

            for br in s.break_times:
                self.db.add(ScheduleBreak(
                    schedule_id=schedule.uuid,
                    break_start=br.break_start,
                    break_end=br.break_end,
                ))

            new_schedules.append(schedule)
        return new_schedules
        try:
            self.db.commit()
            return new_schedules
        except Exception:
            self.db.rollback()
            raise


    def copy_business_schedule_to_employees(
        self, business_id: UUID, employee_ids: List[UUID]
    ) -> List[Schedule]:
        """Copy business schedule rows (+ breaks) to each employee."""
        if not employee_ids:
            return []
        business_schedules = self.get_schedules_with_breaks(
            business_id, ScheduleEntityType.BUSINESS
        )
        if not business_schedules:
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
        return (
            self.db.query(ScheduleBreak)
            .filter(ScheduleBreak.schedule_id == schedule_id)
            .order_by(ScheduleBreak.break_start)
            .all()
        )

    def create_schedule_breaks(
        self, schedule_id: UUID, break_times: List[BreakTimeInput]
    ) -> List[ScheduleBreak]:
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

    def delete_breaks_for_schedule(self, schedule_id: UUID) -> None:
        self.db.execute(
            delete(ScheduleBreak).where(ScheduleBreak.schedule_id == schedule_id)
        )

    # ──────────────────────────────────────────────────────────────────────────
    # ScheduleException CRUD
    # ──────────────────────────────────────────────────────────────────────────

    def get_exceptions_for_schedule(self, schedule_id: UUID) -> List[ScheduleException]:
        return (
            self.db.query(ScheduleException)
            .filter(ScheduleException.schedule_id == schedule_id)
            .order_by(ScheduleException.exception_date)
            .all()
        )

    def get_exception_for_date(
        self, schedule_id: UUID, exception_date: date_type
    ) -> Optional[ScheduleException]:
        return (
            self.db.query(ScheduleException)
            .filter(
                ScheduleException.schedule_id == schedule_id,
                ScheduleException.exception_date == exception_date,
            )
            .first()
        )

    def get_exception_for_entity_date(
        self,
        entity_id: UUID,
        entity_type: ScheduleEntityType,
        lookup_date: date_type,
    ) -> Optional[ScheduleException]:
        """Find any exception for this entity on the given date (joining via Schedule)."""
        # Use JS convention (0=Sun … 6=Sat) to match how day_of_week is stored by the frontend.
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
        return self.get_exception_for_date(schedule.uuid, lookup_date)

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
        except Exception:
            self.db.rollback()
            raise

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
        except Exception:
            self.db.rollback()
            raise

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
        except Exception:
            self.db.rollback()
            raise

