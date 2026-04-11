"""
Slot generation for FIXED/APPROXIMATE appointment modes.
Generates appointment_slots from queue's operating window; slot duration = min of queue's service avg times.
"""
from datetime import date, time, datetime, timedelta
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.queue import Queue, AppointmentSlot
from app.services.queue_service import QueueService
from app.services.booking_calculation_service import BookingCalculationService
from app.core.constants import BOOKING_MODE_FIXED, BOOKING_MODE_APPROXIMATE, BOOKING_MODE_HYBRID


def _time_add(t: time, delta_minutes: int, ref_date: date) -> time:
    """Add delta_minutes to time t using ref_date for datetime arithmetic."""
    dt = datetime.combine(ref_date, t) + timedelta(minutes=delta_minutes)
    return dt.time()


def _overlaps_break(slot_start: time, slot_end: time, breaks: List[tuple]) -> bool:
    """True if [slot_start, slot_end) overlaps any (break_start, break_end)."""
    for b_start, b_end in breaks:
        if slot_start < b_end and slot_end > b_start:
            return True
    return False


class SlotGenerationService:
    """Generate and retrieve appointment slots for a queue on a given date."""

    def __init__(self, db: Session):
        self.db = db
        self.queue_service = QueueService(db)
        self.booking_calc = BookingCalculationService(db)

    def get_or_generate_slots(
        self,
        queue_id: UUID,
        target_date: date,
        queue: Optional[Queue] = None,
    ) -> List[AppointmentSlot]:
        """
        Idempotent: return existing slots for queue+date, or generate and persist new ones.
        Slot duration = queue's min service avg time (from get_queue_min_slot_duration_minutes).
        """
        existing = (
            self.db.query(AppointmentSlot)
            .filter(
                AppointmentSlot.queue_id == queue_id,
                AppointmentSlot.slot_date == target_date,
            )
            .order_by(AppointmentSlot.slot_start)
            .all()
        )
        if existing:
            return existing

        q = queue or self.queue_service.get_queue_by_id_with_employees(queue_id)
        if not q or q.booking_mode not in (BOOKING_MODE_FIXED, BOOKING_MODE_APPROXIMATE, BOOKING_MODE_HYBRID):
            return []

        slots = self._generate_slots_for_queue(q, target_date)
        if not slots:
            return []

        for s in slots:
            self.db.add(s)
        self.db.commit()
        # Re-query in a single SELECT instead of N individual refresh calls
        slots = (
            self.db.query(AppointmentSlot)
            .filter(
                AppointmentSlot.queue_id == queue_id,
                AppointmentSlot.slot_date == target_date,
            )
            .order_by(AppointmentSlot.slot_start)
            .all()
        )
        return slots

    def _generate_slots_for_queue(self, queue: Queue, target_date: date) -> List[AppointmentSlot]:
        """Build slot list from queue's operating window; do not persist."""
        open_time, close_time, breaks, employee_available = self.booking_calc.get_employee_window(
            queue, target_date
        )
        if not employee_available or open_time >= close_time:
            return []

        slot_duration = self.queue_service.get_queue_min_slot_duration_minutes(queue.uuid)
        raw_interval = queue.slot_interval_minutes
        slot_interval = raw_interval if (raw_interval is not None and raw_interval > 0) else slot_duration
        capacity = max(1, queue.max_per_slot or 1)

        slots: List[AppointmentSlot] = []
        current = open_time
        ref_date = target_date

        while current < close_time:
            slot_end = _time_add(current, slot_duration, ref_date)
            if slot_end > close_time:
                break
            if not _overlaps_break(current, slot_end, breaks):
                slots.append(
                    AppointmentSlot(
                        queue_id=queue.uuid,
                        slot_date=target_date,
                        slot_start=current,
                        slot_end=slot_end,
                        capacity=capacity,
                        booked_count=0,
                        is_blocked=False,
                    )
                )
            current = _time_add(current, slot_interval, ref_date)

        return slots
