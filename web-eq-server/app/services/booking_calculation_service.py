import pytz
from uuid import UUID
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, date, time, timedelta

from app.core.constants import (
    TIMEZONE,
    BIZ_LATEST_TIME,
    TIME_FORMAT_HM,
    DEFAULT_AVG_TIME,
    DEFAULT_OPEN_TIME,
)
from app.core.utils import today_app_date
from app.models.schedule import ScheduleEntityType


class BookingCalculationService:
    """Computes booking metrics and optimal queue options using data from QueueService."""

    def __init__(self, db: Session):
        self.db = db
        from app.services.queue_service import QueueService
        from app.services.schedule_service import ScheduleService
        self.queue = QueueService(db)
        self.schedule = ScheduleService(db)
        self.ist = pytz.timezone(TIMEZONE)

    def now_ist(self) -> datetime:
        return datetime.now(self.ist)

    # ──────────────────────────────────────────────────────────────────────────
    # Employee schedule helpers  (DB queries delegated to ScheduleService)
    # ──────────────────────────────────────────────────────────────────────────

    def get_employee_window(
        self, queue: Any, booking_date: date
    ) -> Tuple[time, time, List[Tuple[time, time]], bool]:
        """Return (opening_time, closing_time, sorted_breaks, employee_available).

        *employee_available* is False when the employee explicitly has no schedule for
        *booking_date* (schedule missing, is_open=False, or a closed exception).
        Callers should surface an "Employee not available" message in that case.

        Lookup order:
          1. Employee's Schedule row + ScheduleBreak rows + any ScheduleException for *booking_date*.
          2. Queue.start_time / Queue.end_time (no breaks) — treated as available.
          3. Hardcoded defaults (DEFAULT_OPEN_TIME / BIZ_LATEST_TIME, no breaks) — treated as available.
        """
        # Frontend stores day_of_week using JS convention: 0=Sun, 1=Mon, …, 6=Sat
        # Python weekday() uses:                          0=Mon, 1=Tue, …, 6=Sun
        # Convert so the lookup matches what is stored in the DB.
        day_of_week = (booking_date.weekday() + 1) % 7
        employees = getattr(queue, "employees", [])

        if employees:
            employee = employees[0]
            schedule = self.schedule.get_schedule_with_breaks_for_day(
                employee.uuid, ScheduleEntityType.EMPLOYEE, day_of_week
            )
            if schedule:
                # NOTE: time(0, 0) is falsy in Python — use explicit None checks so
                # midnight (always-open) opening is never replaced by DEFAULT_OPEN_TIME.
                opening = schedule.opening_time if schedule.opening_time is not None else DEFAULT_OPEN_TIME
                closing = schedule.closing_time if schedule.closing_time is not None else BIZ_LATEST_TIME

                exception = self.schedule.get_exception_for_date(schedule.uuid, booking_date)
                if exception:
                    if exception.is_closed:
                        return opening, opening, [], False
                    if exception.special_opening_time:
                        opening = exception.special_opening_time
                    if exception.special_closing_time:
                        closing = exception.special_closing_time

                if not schedule.is_open:
                    return opening, opening, [], False

                breaks = sorted(
                    [(b.break_start, b.break_end) for b in schedule.breaks if b.break_start < b.break_end],
                    key=lambda b: b[0],
                )
                return opening, closing, breaks, True

            # Employee exists but has no schedule configured for this day
            return DEFAULT_OPEN_TIME, BIZ_LATEST_TIME, [], False

        # Fall back to queue-level times (no breaks) — assume available.
        # NOTE: time(0, 0) is falsy — use explicit None check to preserve midnight start_time.
        if queue.start_time is not None:
            return queue.start_time, queue.end_time if queue.end_time is not None else BIZ_LATEST_TIME, [], True

        return DEFAULT_OPEN_TIME, BIZ_LATEST_TIME, [], True

    # ──────────────────────────────────────────────────────────────────────────
    # Break-aware clock-time calculation (supports multiple breaks)
    # ──────────────────────────────────────────────────────────────────────────

    def work_minutes_to_clock_time(
        self,
        base_dt: datetime,
        work_minutes: int,
        breaks: List[Tuple[time, time]],
    ) -> datetime:
        """Convert *work_minutes* of productive time starting at *base_dt* into a
        wall-clock datetime, skipping all break windows on the same calendar day.

        *breaks* is a list of (break_start, break_end) time tuples, sorted ascending.
        Works with both tz-aware (today / IST) and tz-naive (future dates) datetimes.
        """
        if not breaks:
            return base_dt + timedelta(minutes=work_minutes)

        base_date = base_dt.date()
        is_aware = base_dt.tzinfo is not None

        def to_dt(t: time) -> datetime:
            if is_aware:
                return self.ist.localize(datetime.combine(base_date, t))
            return datetime.combine(base_date, t)

        break_dts = [(to_dt(bs), to_dt(be)) for bs, be in breaks]

        current = base_dt
        remaining = work_minutes

        for bk_start, bk_end in break_dts:
            if bk_start <= current < bk_end:
                current = bk_end
                continue

            if bk_end <= current:
                continue

            minutes_before_break = int((bk_start - current).total_seconds() / 60)
            if remaining <= minutes_before_break:
                return current + timedelta(minutes=remaining)

            remaining -= minutes_before_break
            current = bk_end

        return current + timedelta(minutes=remaining)

    # ──────────────────────────────────────────────────────────────────────────
    # Public booking-preview entry points
    # ──────────────────────────────────────────────────────────────────────────

    def calculate_booking_preview(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
        today_metrics: Optional[Dict] = None,
        services_by_queue: Optional[Dict] = None,
    ) -> Dict:
        queue_options = self.get_queue_options(
            business_id, booking_date, queue_service_ids,
            services_by_queue or {},
            today_metrics=today_metrics,
        )
        if not queue_options:
            return {
                "business_id": str(business_id),
                "date": booking_date.isoformat(),
                "queues": [],
                "recommended_queue_id": None,
            }

        # Only available queues (employee present and slot not full) are eligible
        # for recommendation. Unavailable ones stay as-is at the end of the list.
        available = [o for o in queue_options if o["available"]]
        unavailable = [o for o in queue_options if not o["available"]]

        recommended_queue_id = None
        if available:
            available.sort(key=lambda x: x["estimated_wait_minutes"])
            available[0]["is_recommended"] = True
            recommended_queue_id = available[0]["queue_id"]

        return {
            "business_id": str(business_id),
            "date": booking_date.isoformat(),
            "queues": available + unavailable,
            "recommended_queue_id": recommended_queue_id,
        }

    def find_optimal_queue(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
        today_metrics: Optional[Dict] = None,
        services_by_queue: Optional[Dict] = None,
    ) -> Optional[Dict]:
        queue_options = self.get_queue_options(
            business_id, booking_date, queue_service_ids,
            services_by_queue or {},
            today_metrics=today_metrics,
        )
        available = [o for o in queue_options if o["available"]]
        if not available:
            return None
        available.sort(key=lambda x: x["estimated_wait_minutes"])
        return available[0]

    def get_queue_options(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
        services_by_queue: Dict,
        today_metrics: Optional[Dict] = None,
    ) -> List[Dict]:
        """Queues that can serve the selected services, with schedule-aware metrics.

        today_metrics and services_by_queue are built by the controller from DB data.
        """
        queues = self.queue.get_queues_offering_service_ids(business_id, queue_service_ids)
        if not queues:
            return []

        queue_ids = [q.uuid for q in queues]
        today = today_app_date()
        percentile_map = self.queue.get_historical_percentile_wait_batch(
            queue_ids, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        current_time = self.now_ist()

        if booking_date == today:
            metrics = today_metrics if today_metrics is not None else {}
            return [
                self.build_today_option(queue, metrics, percentile_map, current_time, services_by_queue)
                for queue in queues
            ]

        future_counts = self.queue.get_future_date_counts_batch(queue_ids, booking_date)
        return [
            self.build_future_option(queue, future_counts, percentile_map, booking_date, services_by_queue)
            for queue in queues
        ]


    def build_today_option(
        self,
        queue: Any,
        today_metrics: Dict[UUID, Dict],
        percentile_map: Dict[UUID, float],
        current_time: datetime,
        services_by_queue: Dict,
    ) -> Dict:
        t = today_metrics.get(
            queue.uuid,
            {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0},
        )
        position, wait_minutes, wait_range = self.compute_wait(
            t["registered_count"], t["in_progress_count"], t["total_wait_minutes"],
            percentile_map.get(queue.uuid, DEFAULT_AVG_TIME), buffer_pct=0.15,
        )

        today_date = current_time.date()
        open_time, close_time, breaks, employee_available = self.get_employee_window(queue, today_date)

        queue_services = services_by_queue.get(queue.uuid, [])

        if not employee_available:
            return {
                "queue_id": str(queue.uuid),
                "queue_name": queue.name,
                "position": 0,
                "estimated_wait_minutes": 0,
                "estimated_wait_range": "",
                "estimated_appointment_time": "",
                "is_recommended": False,
                "available": False,
                "unavailability_reason": "employee_not_available",
                "services": queue_services,
            }

        open_dt = self.ist.localize(datetime.combine(today_date, open_time))
        close_dt = self.ist.localize(datetime.combine(today_date, close_time))
        base_dt = max(current_time, open_dt)

        appointment_dt = self.work_minutes_to_clock_time(base_dt, wait_minutes, breaks)
        appointment_time = appointment_dt.strftime(TIME_FORMAT_HM)

        available = appointment_dt <= close_dt and position < (queue.limit or 50)

        return {
            "queue_id": str(queue.uuid),
            "queue_name": queue.name,
            "position": position,
            "estimated_wait_minutes": wait_minutes,
            "estimated_wait_range": wait_range,
            "estimated_appointment_time": appointment_time,
            "is_recommended": False,
            "available": available,
            "unavailability_reason": None,
            "services": queue_services,
        }

    def build_future_option(
        self,
        queue: Any,
        future_counts: Dict[UUID, int],
        percentile_map: Dict[UUID, float],
        booking_date: date,
        services_by_queue: Dict,
    ) -> Dict:
        scheduled_count = future_counts.get(queue.uuid, 0)
        position, wait_minutes, wait_range = self.compute_future_wait(
            scheduled_count, percentile_map.get(queue.uuid, DEFAULT_AVG_TIME), buffer_pct=0.20,
        )

        open_time, close_time, breaks, employee_available = self.get_employee_window(queue, booking_date)

        queue_services = services_by_queue.get(queue.uuid, [])

        if not employee_available:
            return {
                "queue_id": str(queue.uuid),
                "queue_name": queue.name,
                "position": 0,
                "estimated_wait_minutes": 0,
                "estimated_wait_range": "",
                "estimated_appointment_time": "",
                "is_recommended": False,
                "available": False,
                "unavailability_reason": "employee_not_available",
                "services": queue_services,
            }

        base_dt = datetime.combine(booking_date, open_time)
        close_dt = datetime.combine(booking_date, close_time)

        appointment_dt = self.work_minutes_to_clock_time(base_dt, wait_minutes, breaks)
        appointment_time = appointment_dt.strftime(TIME_FORMAT_HM)

        available = appointment_dt <= close_dt and position < (queue.limit or 50)

        return {
            "queue_id": str(queue.uuid),
            "queue_name": queue.name,
            "position": position,
            "estimated_wait_minutes": wait_minutes,
            "estimated_wait_range": wait_range,
            "estimated_appointment_time": appointment_time,
            "is_recommended": False,
            "available": available,
            "unavailability_reason": None,
            "services": queue_services,
        }


    def calculate_today_queue_metrics(
        self,
        queue_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
        today_metrics: Optional[Dict] = None,
    ) -> Dict:
        """Real-time metrics for one queue on today's date. today_metrics built by controller."""
        metrics_map = today_metrics if today_metrics is not None else {}
        t = metrics_map.get(
            queue_id,
            {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0},
        )
        percentile_wait = self.queue.get_historical_percentile_wait_single(
            queue_id, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        position, wait_minutes, wait_range = self.compute_wait(
            t["registered_count"], t["in_progress_count"], t["total_wait_minutes"],
            percentile_wait, buffer_pct=0.15,
        )

        current_time = self.now_ist()
        queue = self.queue.get_queue_by_id(queue_id)
        appointment_dt = self.resolve_today_appointment(queue, current_time, wait_minutes)
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_dt.strftime(TIME_FORMAT_HM),
        }

    def calculate_future_queue_metrics(
        self,
        queue_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> Dict:
        """Estimated metrics for one queue on a future date."""
        counts = self.queue.get_future_date_counts_batch([queue_id], booking_date)
        scheduled_count = counts.get(queue_id, 0)
        percentile_wait = self.queue.get_historical_percentile_wait_single(
            queue_id, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        position, wait_minutes, wait_range = self.compute_future_wait(
            scheduled_count, percentile_wait, buffer_pct=0.20,
        )

        queue = self.queue.get_queue_by_id(queue_id)
        appointment_dt = self.resolve_future_appointment(queue, booking_date, wait_minutes)
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_dt.strftime(TIME_FORMAT_HM),
        }

    def get_existing_queue_user_metrics(self, existing_queue_user: Any) -> Dict:
        """Position, wait time, appointment time for an already-queued user (same-day)."""
        ahead = self.queue.get_queue_user_ahead_metrics(
            queue_id=existing_queue_user.queue_id,
            queue_date=existing_queue_user.queue_date,
            enqueue_time=getattr(existing_queue_user, "enqueue_time", None),
            created_at=getattr(existing_queue_user, "created_at", None),
            exclude_queue_user_id=existing_queue_user.uuid,
        )
        ahead_count = ahead["ahead_count"]
        total_wait_minutes = ahead["total_wait_minutes"]
        percentile_wait = self.queue.get_historical_percentile_wait_single(
            existing_queue_user.queue_id,
            existing_queue_user.queue_date,
            0.75,
            float(DEFAULT_AVG_TIME),
        )
        position = ahead_count + 1
        base_wait = int(total_wait_minutes) if total_wait_minutes > 0 else int(position * percentile_wait)
        buffer = int(base_wait * 0.15)
        wait_minutes = base_wait + buffer
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        wait_range = f"{wait_min}-{wait_max} min"

        current_time = self.now_ist()
        queue = self.queue.get_queue_by_id(existing_queue_user.queue_id)
        appointment_dt = self.resolve_today_appointment(queue, current_time, wait_minutes)
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_dt.strftime(TIME_FORMAT_HM),
        }


    @staticmethod
    def compute_wait(
        registered: int,
        in_progress: int,
        total_wait: int,
        percentile_wait: float,
        buffer_pct: float,
    ) -> Tuple[int, int, str]:
        """Compute (position, wait_minutes, wait_range) for a live (today) queue."""
        position = registered + in_progress + 1
        base_wait = int(total_wait) if total_wait > 0 else int(position * percentile_wait)
        buffer = int(base_wait * buffer_pct)
        wait_minutes = base_wait + buffer
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        return position, wait_minutes, f"{wait_min}-{wait_max} min"

    @staticmethod
    def compute_future_wait(
        scheduled_count: int,
        percentile_wait: float,
        buffer_pct: float,
    ) -> Tuple[int, int, str]:
        """Compute (position, wait_minutes, wait_range) for a future booking."""
        position = scheduled_count + 1
        wait_minutes = int(position * percentile_wait)
        buffer = int(wait_minutes * buffer_pct)
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        return position, wait_minutes, f"{wait_min}-{wait_max} min"

    def resolve_today_appointment(
        self, queue: Optional[Any], current_time: datetime, wait_minutes: int
    ) -> datetime:
        """Return the tz-aware IST appointment datetime for a today booking."""
        if queue is None:
            return current_time + timedelta(minutes=wait_minutes)

        today_date = current_time.date()
        open_time, _close, breaks, _ = self.get_employee_window(queue, today_date)
        open_dt = self.ist.localize(datetime.combine(today_date, open_time))
        base_dt = max(current_time, open_dt)
        return self.work_minutes_to_clock_time(base_dt, wait_minutes, breaks)

    def resolve_future_appointment(
        self, queue: Optional[Any], booking_date: date, wait_minutes: int
    ) -> datetime:
        """Return the tz-naive appointment datetime for a future booking."""
        if queue is None:
            return datetime.combine(booking_date, DEFAULT_OPEN_TIME) + timedelta(minutes=wait_minutes)

        open_time, _close, breaks, _ = self.get_employee_window(queue, booking_date)
        base_dt = datetime.combine(booking_date, open_time)
        return self.work_minutes_to_clock_time(base_dt, wait_minutes, breaks)
