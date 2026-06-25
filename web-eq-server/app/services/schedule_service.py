import logging
from dataclasses import dataclass
from datetime import date as date_type, datetime, timezone
from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException
from uuid import UUID
from typing import List, Dict, Tuple, Optional

from app.models.schedule import Schedule, ScheduleBreak, ScheduleException, ScheduleEntityType
from app.models.business import Business
from app.models.employee import Employee
from app.schemas.schedule import ScheduleInput, BreakTimeInput, ScheduleExceptionCreate, ScheduleExceptionUpdate
from app.core.constants import (
    BIZ_EARLIEST_TIME, BIZ_LATEST_TIME,
    LEAVE_STATUS_PENDING, LEAVE_STATUS_APPROVED, LEAVE_STATUS_REJECTED,
)

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
        only_approved: bool = False,
    ) -> Dict[UUID, ScheduleException]:
        """Batch fetch schedule exceptions for multiple schedules on one date.

        Returns a dict keyed by schedule_id. One SELECT with IN clause —
        eliminates N per-schedule queries when processing a list of queues.

        Pass only_approved=True from the booking engine so PENDING leave
        requests do not block bookings until a business approves them.
        """
        if not schedule_ids:
            return {}
        try:
            query = self.db.query(ScheduleException).filter(
                ScheduleException.schedule_id.in_(schedule_ids),
                ScheduleException.exception_date == exception_date,
            )
            if only_approved:
                query = query.filter(ScheduleException.status == LEAVE_STATUS_APPROVED)
            rows = query.all()
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

    def get_exceptions_for_employee(
        self,
        employee_id: UUID,
        from_date: Optional[date_type] = None,
        to_date: Optional[date_type] = None,
    ) -> List[ScheduleException]:
        """All exceptions across an employee's schedule rows (their leave history).

        Window with from_date / to_date for the self-service Upcoming/Past/All views.
        Upcoming sorts soonest-first; a to_date-only (history) window sorts
        most-recent first. Joins exception → schedule, scoped to the employee.
        """
        try:
            query = (
                self.db.query(ScheduleException)
                .join(Schedule, Schedule.uuid == ScheduleException.schedule_id)
                .filter(
                    Schedule.entity_id == employee_id,
                    Schedule.entity_type == ScheduleEntityType.EMPLOYEE,
                )
            )
            if from_date is not None:
                query = query.filter(ScheduleException.exception_date >= from_date)
            if to_date is not None:
                query = query.filter(ScheduleException.exception_date <= to_date)
            order = (
                ScheduleException.exception_date.desc()
                if (to_date is not None and from_date is None)
                else ScheduleException.exception_date.asc()
            )
            return query.order_by(order).all()
        except Exception:
            logger.exception("Failed to get_exceptions_for_employee (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exception_for_date(
        self, schedule_id: UUID, exception_date: date_type, only_approved: bool = False
    ) -> Optional[ScheduleException]:
        """Fetch the exception for one schedule + date.

        Pass only_approved=True from the booking engine so a PENDING leave
        request does not block bookings until the business approves it. CRUD
        callers leave it False to find the row regardless of status.
        """
        try:
            query = self.db.query(ScheduleException).filter(
                ScheduleException.schedule_id == schedule_id,
                ScheduleException.exception_date == exception_date,
            )
            if only_approved:
                query = query.filter(ScheduleException.status == LEAVE_STATUS_APPROVED)
            return query.first()
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
        self,
        data: ScheduleExceptionCreate,
        status: str = LEAVE_STATUS_APPROVED,
        created_by_role: Optional[str] = None,
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
                reason=data.reason,
                status=status,
                created_by_role=created_by_role,
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

    def bulk_create_exceptions(self, items: List[ScheduleException]) -> List[ScheduleException]:
        """Persist a batch of exception rows (one multi-day leave) in one commit."""
        try:
            self.db.add_all(items)
            self.db.commit()
            return items
        except Exception:
            self.db.rollback()
            logger.exception("Failed to bulk_create_exceptions (count=%s)", len(items))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exceptions_by_group(self, group_id: UUID) -> List[ScheduleException]:
        try:
            return (
                self.db.query(ScheduleException)
                .filter(ScheduleException.leave_group_id == group_id)
                .order_by(ScheduleException.exception_date)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_exceptions_by_group (group_id=%s)", group_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def review_exceptions(self, rows: List[ScheduleException], approve: bool, reviewed_by: UUID) -> List[ScheduleException]:
        """Approve/reject every row of a leave group in one commit."""
        try:
            new_status = LEAVE_STATUS_APPROVED if approve else LEAVE_STATUS_REJECTED
            now = datetime.now(timezone.utc)
            for exc in rows:
                exc.status = new_status
                exc.reviewed_by = reviewed_by
                exc.reviewed_at = now
            self.db.commit()
            return rows
        except Exception:
            self.db.rollback()
            logger.exception("Failed to review_exceptions (count=%s)", len(rows))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def delete_exceptions(self, rows: List[ScheduleException]) -> int:
        """Delete every row of a leave group in one commit."""
        try:
            for exc in rows:
                self.db.delete(exc)
            self.db.commit()
            return len(rows)
        except Exception:
            self.db.rollback()
            logger.exception("Failed to delete_exceptions (count=%s)", len(rows))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_schedule_by_id(self, schedule_id: UUID) -> Optional[Schedule]:
        try:
            return self.db.query(Schedule).filter(Schedule.uuid == schedule_id).first()
        except Exception:
            logger.exception("Failed to get_schedule_by_id (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_exception_by_id(self, exception_id: UUID) -> Optional[ScheduleException]:
        try:
            return (
                self.db.query(ScheduleException)
                .filter(ScheduleException.uuid == exception_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_exception_by_id (exception_id=%s)", exception_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def review_schedule_exception(
        self, exc: ScheduleException, approve: bool, reviewed_by: UUID
    ) -> ScheduleException:
        """Approve or reject a pending leave/exception request."""
        try:
            exc.status = LEAVE_STATUS_APPROVED if approve else LEAVE_STATUS_REJECTED
            exc.reviewed_by = reviewed_by
            exc.reviewed_at = datetime.now(timezone.utc)
            self.db.commit()
            return exc
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to review_schedule_exception (exception_id=%s)", getattr(exc, "uuid", None))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_pending_exceptions_for_business(
        self, business_id: UUID
    ) -> List[Tuple[ScheduleException, Employee]]:
        """All PENDING employee leave requests for a business (for the approval inbox).

        Joins exception → employee schedule → employee, scoped to the business.
        Returns (exception, employee) tuples so the caller can show who requested it.
        """
        try:
            return (
                self.db.query(ScheduleException, Employee)
                .join(Schedule, Schedule.uuid == ScheduleException.schedule_id)
                .join(
                    Employee,
                    (Employee.uuid == Schedule.entity_id)
                    & (Schedule.entity_type == ScheduleEntityType.EMPLOYEE),
                )
                .filter(
                    Employee.business_id == business_id,
                    ScheduleException.status == LEAVE_STATUS_PENDING,
                )
                .order_by(ScheduleException.exception_date)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_pending_exceptions_for_business (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_leaves_for_business(
        self,
        business_id: UUID,
        from_date: Optional[date_type] = None,
        to_date: Optional[date_type] = None,
        statuses: Optional[List[str]] = None,
    ) -> List[Tuple[ScheduleException, Employee]]:
        """Employee leaves for a business (roster view), enriched with the employee.

        Same join as get_pending_exceptions_for_business, but not limited to PENDING:
        pass from_date / to_date to window the rows and statuses to filter (e.g.
        [PENDING, APPROVED] to exclude rejected). Upcoming rows sort ascending; a
        to_date-only window (history) sorts most-recent first. Returns (exception,
        employee) tuples.
        """
        try:
            query = (
                self.db.query(ScheduleException, Employee)
                .join(Schedule, Schedule.uuid == ScheduleException.schedule_id)
                .join(
                    Employee,
                    (Employee.uuid == Schedule.entity_id)
                    & (Schedule.entity_type == ScheduleEntityType.EMPLOYEE),
                )
                .filter(Employee.business_id == business_id)
            )
            if from_date is not None:
                query = query.filter(ScheduleException.exception_date >= from_date)
            if to_date is not None:
                query = query.filter(ScheduleException.exception_date <= to_date)
            if statuses:
                query = query.filter(ScheduleException.status.in_(statuses))
            # History (to_date set, no from_date) reads best newest-first; otherwise
            # show the soonest upcoming leave first.
            order = (
                ScheduleException.exception_date.desc()
                if (to_date is not None and from_date is None)
                else ScheduleException.exception_date.asc()
            )
            return query.order_by(order).all()
        except Exception:
            logger.exception("Failed to get_leaves_for_business (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_for_exception(self, exc: ScheduleException) -> Optional[Employee]:
        """Resolve the Employee that owns the schedule behind an exception (None if business-level)."""
        try:
            schedule = (
                self.db.query(Schedule)
                .filter(Schedule.uuid == exc.schedule_id)
                .first()
            )
            if not schedule or schedule.entity_type != ScheduleEntityType.EMPLOYEE:
                return None
            return (
                self.db.query(Employee)
                .filter(Employee.uuid == schedule.entity_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_employee_for_exception (exception_id=%s)", getattr(exc, "uuid", None))
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

