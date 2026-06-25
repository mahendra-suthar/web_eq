import logging
from datetime import date as date_type, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List
from uuid import UUID, uuid4

from app.core.constants import (
    BIZ_EARLIEST_TIME, BIZ_LATEST_TIME,
    LEAVE_STATUS_PENDING, LEAVE_STATUS_APPROVED, LEAVE_STATUS_REJECTED,
    LEAVE_ROLE_EMPLOYEE, LEAVE_ROLE_BUSINESS,
)
from app.models.user import User
from app.models.schedule import ScheduleEntityType, ScheduleException
from app.services.schedule_service import ScheduleService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.services.queue_service import QueueService
from app.schemas.schedule import (
    ScheduleCreateInput, ScheduleData, ScheduleInput,
    ScheduleExceptionCreate, ScheduleExceptionByDateCreate,
    ScheduleExceptionRangeCreate, LeaveBatchResult,
    ScheduleExceptionData, ScheduleExceptionUpdate,
    PendingLeaveData,
)

logger = logging.getLogger(__name__)


class ScheduleController:
    def __init__(self, db: Session):
        self.db = db
        self.schedule_service = ScheduleService(db)
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)
        self.queue_service = QueueService(db)

    def can_edit_schedule(self, user: User, entity_id, entity_type_enum: ScheduleEntityType) -> bool:
        if entity_type_enum == ScheduleEntityType.BUSINESS:
            business = self.business_service.get_business_by_owner(user.uuid)
            return business is not None and str(business.uuid) == str(entity_id)
        if entity_type_enum == ScheduleEntityType.EMPLOYEE:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            if employee is not None and str(employee.uuid) == str(entity_id):
                return True
            employee = self.employee_service.get_employee_by_id(entity_id)
            if employee is None:
                return False
            business = self.business_service.get_business_by_owner(user.uuid)
            return business is not None and str(business.uuid) == str(employee.business_id)
        return False

    def get_business_schedule_data_for_validation(self, business_id):
        return self.schedule_service.get_business_schedule_data_for_validation(business_id)

    def validate_employee_schedule_within_business(
        self,
        employee_schedules: List[ScheduleInput],
        is_always_open: bool,
        business_by_day: dict,
    ) -> str | None:
        for inp in employee_schedules:
            day = inp.day_of_week
            biz = business_by_day.get(day)
            if is_always_open:
                continue
            if biz is None or not getattr(biz, "is_open", False):
                if inp.is_open:
                    return f"Employee cannot be open on day {day}: business is closed that day."
                continue
            biz_open = getattr(biz, "opening_time", None) or BIZ_EARLIEST_TIME
            biz_close = getattr(biz, "closing_time", None) or BIZ_LATEST_TIME
            if not inp.is_open:
                continue
            emp_open = inp.opening_time or BIZ_EARLIEST_TIME
            emp_close = inp.closing_time or BIZ_LATEST_TIME
            if emp_open < biz_open:
                return f"Employee opening time on day {day} must not be before business opening time."
            if emp_close > biz_close:
                return f"Employee closing time on day {day} must not be after business closing time."
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule CRUD
    # ──────────────────────────────────────────────────────────────────────────

    async def create_schedules(
        self, payload: ScheduleCreateInput, user: User
    ) -> List[ScheduleData]:
        try:
            entity_type_enum = ScheduleEntityType[payload.entity_type.upper()]
            if not self.can_edit_schedule(user, payload.entity_id, entity_type_enum):
                raise HTTPException(status_code=403, detail="Not allowed to update this schedule")

            is_business = entity_type_enum == ScheduleEntityType.BUSINESS

            if is_business and payload.is_always_open is not None:
                self.business_service.update_registration_state(
                    business_id=payload.entity_id,
                    is_always_open=payload.is_always_open,
                    current_step=2,
                )

            if entity_type_enum == ScheduleEntityType.EMPLOYEE:
                employee = self.employee_service.get_employee_by_id(payload.entity_id)
                if not employee:
                    raise HTTPException(status_code=404, detail="Employee not found")
                is_always_open, business_by_day = self.get_business_schedule_data_for_validation(
                    employee.business_id
                )
                err = self.validate_employee_schedule_within_business(
                    payload.schedules, is_always_open, business_by_day
                )
                if err:
                    raise HTTPException(status_code=400, detail=err)

            self.schedule_service.replace_schedules_for_entity(
                payload.entity_id, entity_type_enum, payload.schedules
            )
            schedules_with_breaks = self.schedule_service.get_schedules_with_breaks(
                payload.entity_id, entity_type_enum
            )
            return [ScheduleData.from_schedule(s) for s in schedules_with_breaks]

        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_schedules (entity_id=%s)", payload.entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_schedules(
        self, entity_id: UUID, entity_type: str
    ) -> List[ScheduleData]:
        try:
            entity_type_enum = ScheduleEntityType[entity_type.upper()]
            schedules = self.schedule_service.get_schedules_with_breaks(entity_id, entity_type_enum)
            return [ScheduleData.from_schedule(s) for s in schedules]
        except KeyError:
            raise HTTPException(status_code=400, detail="Invalid entity_type")
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_schedules (entity_id=%s)", entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    # ──────────────────────────────────────────────────────────────────────────
    # Schedule Exception CRUD
    # ──────────────────────────────────────────────────────────────────────────

    async def get_schedule_exceptions(
        self, schedule_id: UUID, user: User
    ) -> List[ScheduleExceptionData]:
        try:
            # Only the owning business or the employee themselves may view.
            self.resolve_exception_actor(user, schedule_id)
            excs = self.schedule_service.get_exceptions_for_schedule(schedule_id)
            return [ScheduleExceptionData.from_orm(e) for e in excs]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_schedule_exceptions (schedule_id=%s)", schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def resolve_actor_for_entity(self, user: User, entity_id, entity_type_enum: ScheduleEntityType):
        """Identify who is acting on a BUSINESS/EMPLOYEE entity's leave.

        Returns (role, employee_or_none). Raises 403 if the user is neither the
        owning business nor the employee themselves; 404 if the employee is missing.
          - BUSINESS owner of the entity        → (LEAVE_ROLE_BUSINESS, employee?)
          - the employee whose entity it is      → (LEAVE_ROLE_EMPLOYEE, employee)
        """
        if entity_type_enum == ScheduleEntityType.BUSINESS:
            business = self.business_service.get_business_by_owner(user.uuid)
            if business is None or str(business.uuid) != str(entity_id):
                raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})
            return LEAVE_ROLE_BUSINESS, None

        # EMPLOYEE entity
        employee = self.employee_service.get_employee_by_id(entity_id)
        if employee is None:
            raise HTTPException(status_code=404, detail={"message": "Employee not found"})

        # Is the caller the business owner of this employee?
        business = self.business_service.get_business_by_owner(user.uuid)
        if business is not None and str(business.uuid) == str(employee.business_id):
            return LEAVE_ROLE_BUSINESS, employee

        # Is the caller the employee themselves?
        self_emp = self.employee_service.get_employee_by_user_id(user.uuid)
        if self_emp is not None and str(self_emp.uuid) == str(employee.uuid):
            return LEAVE_ROLE_EMPLOYEE, employee

        raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})

    def resolve_exception_actor(self, user: User, schedule_id: UUID):
        """Same as resolve_actor_for_entity, but keyed off a schedule row."""
        schedule = self.schedule_service.get_schedule_by_id(schedule_id)
        if not schedule:
            raise HTTPException(status_code=404, detail={"message": "Schedule not found"})
        return self.resolve_actor_for_entity(user, schedule.entity_id, schedule.entity_type)

    def assert_no_active_bookings(self, employee, exception_date) -> None:
        """Block full-day leave when customers are already booked on that date.

        Mirrors the delete-queue active-customer guard. Only applies to the
        employee's assigned queue for the leave date.
        """
        if employee is None or getattr(employee, "queue_id", None) is None:
            return
        active = self.queue_service.count_active_bookings_for_date(
            employee.queue_id, exception_date
        )
        if active > 0:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": (
                        f"Cannot mark leave on {exception_date} — {active} customer(s) "
                        "are already booked. Clear or reschedule them from Live Queue first."
                    )
                },
            )

    async def create_schedule_exception(
        self, payload: ScheduleExceptionCreate, user: User
    ) -> ScheduleExceptionData:
        try:
            role, employee = self.resolve_exception_actor(user, payload.schedule_id)
            # Business-created → effective immediately. Employee-requested → pending review.
            if role == LEAVE_ROLE_BUSINESS:
                # Block business from marking full-day leave over existing bookings.
                if payload.is_closed:
                    self.assert_no_active_bookings(employee, payload.exception_date)
                status = LEAVE_STATUS_APPROVED
            else:
                status = LEAVE_STATUS_PENDING

            exc = self.schedule_service.create_schedule_exception(
                payload, status=status, created_by_role=role
            )
            return ScheduleExceptionData.from_orm(exc)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to create_schedule_exception (schedule_id=%s)", payload.schedule_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def create_schedule_exception_by_date(
        self, payload: ScheduleExceptionByDateCreate, user: User
    ) -> ScheduleExceptionData:
        """Resolve the weekday's schedule row server-side, then create the exception.

        Avoids any client-side weekday math: the booking engine derives the day as
        (date.weekday() + 1) % 7, and we use the exact same rule here so the
        exception is always attached to the row the engine will look up.
        """
        try:
            entity_type_enum = ScheduleEntityType[payload.entity_type.upper()]
            day_of_week = (payload.exception_date.weekday() + 1) % 7
            schedule = self.schedule_service.get_schedule_for_entity_day(
                payload.entity_id, entity_type_enum, day_of_week
            )
            if schedule is None:
                raise HTTPException(
                    status_code=400,
                    detail={"message": "Not scheduled to work on that day, so there's nothing to take off."},
                )
            create_payload = ScheduleExceptionCreate(
                schedule_id=schedule.uuid,
                exception_date=payload.exception_date,
                special_opening_time=payload.special_opening_time,
                special_closing_time=payload.special_closing_time,
                is_closed=payload.is_closed,
                reason=payload.reason,
            )
            return await self.create_schedule_exception(create_payload, user)
        except KeyError:
            raise HTTPException(status_code=400, detail={"message": "Invalid entity_type"})
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Failed to create_schedule_exception_by_date (entity_id=%s date=%s)",
                payload.entity_id, payload.exception_date,
            )
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def create_schedule_exception_range(
        self, payload: ScheduleExceptionRangeCreate, user: User
    ) -> LeaveBatchResult:
        """Expand a date range into one exception row per working day, sharing a
        leave_group_id so the span can be approved / removed as a single unit.

        Per day: skip non-working days, dates that already have an exception, and
        (for business full-day marks) dates with active bookings. Business →
        APPROVED immediately; employee → PENDING.
        """
        try:
            entity_type_enum = ScheduleEntityType[payload.entity_type.upper()]
            role, employee = self.resolve_actor_for_entity(user, payload.entity_id, entity_type_enum)
            status = LEAVE_STATUS_APPROVED if role == LEAVE_ROLE_BUSINESS else LEAVE_STATUS_PENDING
            group_id = uuid4()

            created: List[date_type] = []
            skipped_non_working: List[date_type] = []
            skipped_existing: List[date_type] = []
            skipped_booked: List[date_type] = []
            rows: List[ScheduleException] = []

            d = payload.start_date
            while d <= payload.end_date:
                day_of_week = (d.weekday() + 1) % 7
                schedule = self.schedule_service.get_schedule_for_entity_day(
                    payload.entity_id, entity_type_enum, day_of_week
                )
                if schedule is None:
                    skipped_non_working.append(d)
                elif self.schedule_service.get_exception_for_date(schedule.uuid, d) is not None:
                    skipped_existing.append(d)
                elif (
                    role == LEAVE_ROLE_BUSINESS and payload.is_closed
                    and employee is not None and getattr(employee, "queue_id", None) is not None
                    and self.queue_service.count_active_bookings_for_date(employee.queue_id, d) > 0
                ):
                    skipped_booked.append(d)
                else:
                    rows.append(ScheduleException(
                        schedule_id=schedule.uuid,
                        exception_date=d,
                        special_opening_time=payload.special_opening_time,
                        special_closing_time=payload.special_closing_time,
                        is_closed=payload.is_closed,
                        reason=payload.reason,
                        status=status,
                        created_by_role=role,
                        leave_group_id=group_id,
                    ))
                    created.append(d)
                d += timedelta(days=1)

            if not rows:
                # Nothing could be created — tell the user why.
                if skipped_booked:
                    msg = "Those days already have customers booked. Clear them from Live Queue first."
                elif skipped_existing and not skipped_non_working:
                    msg = "Leave already exists for the selected day(s)."
                else:
                    msg = "No working days in the selected range."
                raise HTTPException(status_code=400, detail={"message": msg})

            self.schedule_service.bulk_create_exceptions(rows)
            return LeaveBatchResult(
                leave_group_id=str(group_id),
                status=status,
                created=created,
                skipped_non_working=skipped_non_working,
                skipped_existing=skipped_existing,
                skipped_booked=skipped_booked,
            )
        except KeyError:
            raise HTTPException(status_code=400, detail={"message": "Invalid entity_type"})
        except HTTPException:
            raise
        except Exception:
            logger.exception(
                "Failed to create_schedule_exception_range (entity_id=%s %s..%s)",
                payload.entity_id, payload.start_date, payload.end_date,
            )
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def review_leave_group(self, group_id: UUID, approve: bool, user: User) -> LeaveBatchResult:
        """Approve/reject every day of a leave group in one action (business only)."""
        try:
            rows = self.schedule_service.get_exceptions_by_group(group_id)
            if not rows:
                raise HTTPException(status_code=404, detail={"message": "Leave request not found"})

            # Authorize via the group's owning entity (all rows share an entity).
            role, employee = self.resolve_exception_actor(user, rows[0].schedule_id)
            if role != LEAVE_ROLE_BUSINESS:
                raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})

            pending_rows = [r for r in rows if r.status == LEAVE_STATUS_PENDING]
            if not pending_rows:
                raise HTTPException(status_code=400, detail={"message": "This request has already been reviewed."})

            if approve:
                # Block approval if any full-day date now has active bookings.
                for r in pending_rows:
                    if bool(r.is_closed):
                        self.assert_no_active_bookings(employee, r.exception_date)

            self.schedule_service.review_exceptions(pending_rows, approve, user.uuid)
            return LeaveBatchResult(
                leave_group_id=str(group_id),
                status=LEAVE_STATUS_APPROVED if approve else LEAVE_STATUS_REJECTED,
                created=[r.exception_date for r in pending_rows],
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to review_leave_group (group_id=%s)", group_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def delete_leave_group(self, group_id: UUID, user: User) -> dict:
        """Remove every day of a leave group. Business → any; employee → only own requests."""
        try:
            rows = self.schedule_service.get_exceptions_by_group(group_id)
            if not rows:
                raise HTTPException(status_code=404, detail={"message": "Leave not found"})

            role, _employee = self.resolve_exception_actor(user, rows[0].schedule_id)
            if role == LEAVE_ROLE_EMPLOYEE and any(r.created_by_role != LEAVE_ROLE_EMPLOYEE for r in rows):
                raise HTTPException(status_code=403, detail={"message": "You can only cancel leave you requested."})

            deleted = self.schedule_service.delete_exceptions(rows)
            return {"success": True, "deleted": deleted}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to delete_leave_group (group_id=%s)", group_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def review_schedule_exception(
        self, exception_id: UUID, approve: bool, user: User
    ) -> ScheduleExceptionData:
        """Business approves/rejects a pending leave request."""
        try:
            exc = self.schedule_service.get_exception_by_id(exception_id)
            if not exc:
                raise HTTPException(status_code=404, detail={"message": "Leave request not found"})

            # Only the owning business may review.
            role, employee = self.resolve_exception_actor(user, exc.schedule_id)
            if role != LEAVE_ROLE_BUSINESS:
                raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})

            if exc.status != LEAVE_STATUS_PENDING:
                raise HTTPException(status_code=400, detail={"message": "This request has already been reviewed."})

            # On approval of a full-day leave, ensure no customers are already booked.
            if approve and bool(exc.is_closed):
                self.assert_no_active_bookings(employee, exc.exception_date)

            exc = self.schedule_service.review_schedule_exception(exc, approve, user.uuid)
            return ScheduleExceptionData.from_orm(exc)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to review_schedule_exception (exception_id=%s)", exception_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_pending_exceptions(self, business_id: UUID, user: User) -> List[PendingLeaveData]:
        """List pending leave requests for a business (approval inbox)."""
        try:
            business = self.business_service.get_business_by_owner(user.uuid)
            if business is None or str(business.uuid) != str(business_id):
                raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})
            rows = self.schedule_service.get_pending_exceptions_for_business(business_id)
            return [PendingLeaveData.from_row(exc, emp) for exc, emp in rows]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_pending_exceptions (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_business_leaves(
        self, business_id: UUID, user: User, scope: str = "upcoming"
    ) -> List[PendingLeaveData]:
        """Employee leaves for a business (roster), windowed by scope.

        - upcoming: today onward, pending + approved (the actionable roster)
        - past:     before today, any status (history, includes rejected)
        - all:      everything, any status
        """
        try:
            business = self.business_service.get_business_by_owner(user.uuid)
            if business is None or str(business.uuid) != str(business_id):
                raise HTTPException(status_code=403, detail={"message": "You don't have permission to do that."})

            today = date_type.today()
            scope = (scope or "upcoming").lower()
            if scope == "past":
                from_date, to_date, statuses = None, today - timedelta(days=1), None
            elif scope == "all":
                from_date, to_date, statuses = None, None, None
            else:  # upcoming (default)
                from_date, to_date, statuses = today, None, [LEAVE_STATUS_PENDING, LEAVE_STATUS_APPROVED]

            rows = self.schedule_service.get_leaves_for_business(
                business_id, from_date=from_date, to_date=to_date, statuses=statuses
            )
            return [PendingLeaveData.from_row(exc, emp) for exc, emp in rows]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_leaves (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def get_my_exceptions(self, user: User, scope: str = "upcoming") -> List[ScheduleExceptionData]:
        """The current employee's own exceptions, windowed by scope.

        - upcoming: today onward   - past: before today   - all: everything
        (all statuses, so the employee can see approved/rejected outcomes too).
        """
        try:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            if employee is None:
                raise HTTPException(status_code=403, detail={"message": "Only employees can view their leave."})

            today = date_type.today()
            scope = (scope or "upcoming").lower()
            if scope == "past":
                from_date, to_date = None, today - timedelta(days=1)
            elif scope == "all":
                from_date, to_date = None, None
            else:  # upcoming
                from_date, to_date = today, None

            excs = self.schedule_service.get_exceptions_for_employee(
                employee.uuid, from_date=from_date, to_date=to_date
            )
            return [ScheduleExceptionData.from_orm(e) for e in excs]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_my_exceptions (user_id=%s)", user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def update_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type, payload: ScheduleExceptionUpdate, user: User
    ) -> ScheduleExceptionData:
        try:
            # Editing special hours is a business-only action.
            role, _employee = self.resolve_exception_actor(user, schedule_id)
            if role != LEAVE_ROLE_BUSINESS:
                raise HTTPException(status_code=403, detail={"message": "Only the business can edit schedule hours."})
            exc = self.schedule_service.update_schedule_exception(
                schedule_id, exception_date, payload
            )
            return ScheduleExceptionData.from_orm(exc)
        except HTTPException:
            raise
        except ValueError as e:
            raise HTTPException(status_code=404, detail={"message": str(e)})
        except Exception:
            logger.exception("Failed to update_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    async def delete_schedule_exception(
        self, schedule_id: UUID, exception_date: date_type, user: User
    ) -> dict:
        try:
            role, _employee = self.resolve_exception_actor(user, schedule_id)
            exc = self.schedule_service.get_exception_for_date(schedule_id, exception_date)
            if not exc:
                raise HTTPException(
                    status_code=404,
                    detail={"message": f"No exception found for date {exception_date}"},
                )
            # Employees may only cancel leave they requested; business-imposed
            # exceptions can only be removed by the business.
            if role == LEAVE_ROLE_EMPLOYEE and exc.created_by_role != LEAVE_ROLE_EMPLOYEE:
                raise HTTPException(status_code=403, detail={"message": "You can only cancel leave you requested."})
            self.schedule_service.delete_schedule_exception(schedule_id, exception_date)
            return {"success": True}
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to delete_schedule_exception (schedule_id=%s date=%s)", schedule_id, exception_date)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
