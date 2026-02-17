from typing import List, Dict, Optional, Any
from uuid import UUID
from datetime import datetime, date, time, timedelta

import pytz

from sqlalchemy.orm import Session


# Default 15 minutes if no historical data
DEFAULT_AVG_TIME = 15


class BookingCalculationService:
    """Computes booking metrics and optimal queue options using data from QueueService."""

    def __init__(self, db: Session):
        self.db = db
        from app.services.queue_service import QueueService
        self._queue = QueueService(db)
        self._ist = pytz.timezone("Asia/Kolkata")

    def _now_ist(self) -> datetime:
        return datetime.now(self._ist)

    def calculate_booking_preview(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> Dict:
        queue_options = self.get_queue_options(business_id, booking_date, queue_service_ids)
        if not queue_options:
            return {
                "business_id": str(business_id),
                "date": booking_date.isoformat(),
                "queues": [],
                "recommended_queue_id": None,
            }
        queue_options.sort(key=lambda x: x["estimated_wait_minutes"])
        queue_options[0]["is_recommended"] = True
        return {
            "business_id": str(business_id),
            "date": booking_date.isoformat(),
            "queues": queue_options,
            "recommended_queue_id": queue_options[0]["queue_id"],
        }

    def find_optimal_queue(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> Optional[Dict]:
        queue_options = self.get_queue_options(business_id, booking_date, queue_service_ids)
        if not queue_options:
            return None
        queue_options.sort(key=lambda x: x["estimated_wait_minutes"])
        return queue_options[0]

    def get_queue_options(
        self,
        business_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> List[Dict]:
        """Queues that can serve the selected services, with metrics (no query in loop)."""
        queues = self._queue.get_queues_offering_service_ids(business_id, queue_service_ids)
        if not queues:
            return []

        queue_ids = [q.uuid for q in queues]
        today = date.today()
        percentile_map = self._queue.get_historical_percentile_wait_batch(
            queue_ids, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        current_time = self._now_ist()

        if booking_date == today:
            today_metrics = self._queue.get_today_queue_metrics_batch(queue_ids, booking_date)
            return [
                self._build_today_option(queue, today_metrics, percentile_map, current_time)
                for queue in queues
            ]

        future_counts = self._queue.get_future_date_counts_batch(queue_ids, booking_date)
        return [
            self._build_future_option(queue, future_counts, percentile_map, booking_date)
            for queue in queues
        ]

    def _build_today_option(
        self,
        queue: Any,
        today_metrics: Dict[UUID, Dict],
        percentile_map: Dict[UUID, float],
        current_time: datetime,
    ) -> Dict:
        t = today_metrics.get(
            queue.uuid,
            {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0},
        )
        reg = t["registered_count"]
        in_prog = t["in_progress_count"]
        total_wait = t["total_wait_minutes"]
        position = reg + in_prog + 1
        percentile_wait = percentile_map.get(queue.uuid, DEFAULT_AVG_TIME)
        base_wait = int(total_wait) if total_wait > 0 else int(position * percentile_wait)
        buffer = int(base_wait * 0.15)
        wait_minutes = base_wait + buffer
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        wait_range = f"{wait_min}-{wait_max} min"
        appointment_datetime = current_time + timedelta(minutes=wait_minutes)
        appointment_time = appointment_datetime.strftime("%H:%M")
        return {
            "queue_id": str(queue.uuid),
            "queue_name": queue.name,
            "position": position,
            "estimated_wait_minutes": wait_minutes,
            "estimated_wait_range": wait_range,
            "estimated_appointment_time": appointment_time,
            "is_recommended": False,
            "available": position < (queue.limit or 50),
        }

    def _build_future_option(
        self,
        queue: Any,
        future_counts: Dict[UUID, int],
        percentile_map: Dict[UUID, float],
        booking_date: date,
    ) -> Dict:
        scheduled_count = future_counts.get(queue.uuid, 0)
        position = scheduled_count + 1
        percentile_wait = percentile_map.get(queue.uuid, DEFAULT_AVG_TIME)
        wait_minutes = int(position * percentile_wait)
        buffer = int(wait_minutes * 0.20)
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        wait_range = f"{wait_min}-{wait_max} min"
        start_time = queue.start_time if queue.start_time else time(9, 0)
        appointment_datetime = datetime.combine(booking_date, start_time) + timedelta(minutes=wait_minutes)
        appointment_time = appointment_datetime.strftime("%H:%M")
        return {
            "queue_id": str(queue.uuid),
            "queue_name": queue.name,
            "position": position,
            "estimated_wait_minutes": wait_minutes,
            "estimated_wait_range": wait_range,
            "estimated_appointment_time": appointment_time,
            "is_recommended": False,
            "available": position < (queue.limit or 50),
        }

    def calculate_today_queue_metrics(
        self,
        queue_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> Dict:
        """Real-time metrics for one queue, today (uses batch under the hood)."""
        metrics_map = self._queue.get_today_queue_metrics_batch([queue_id], booking_date)
        t = metrics_map.get(
            queue_id,
            {"registered_count": 0, "in_progress_count": 0, "total_wait_minutes": 0},
        )
        reg = t["registered_count"]
        in_prog = t["in_progress_count"]
        total_wait_minutes = t["total_wait_minutes"]
        percentile_wait = self._queue.get_historical_percentile_wait_single(
            queue_id, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        position = reg + in_prog + 1
        base_wait = int(total_wait_minutes) if total_wait_minutes > 0 else int(position * percentile_wait)
        buffer = int(base_wait * 0.15)
        wait_minutes = base_wait + buffer
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        wait_range = f"{wait_min}-{wait_max} min"
        current_time = self._now_ist()
        appointment_datetime = current_time + timedelta(minutes=wait_minutes)
        appointment_time = appointment_datetime.strftime("%H:%M")
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_time,
        }

    def calculate_future_queue_metrics(
        self,
        queue_id: UUID,
        booking_date: date,
        queue_service_ids: List[UUID],
    ) -> Dict:
        """Estimated metrics for one queue, future date."""
        counts = self._queue.get_future_date_counts_batch([queue_id], booking_date)
        scheduled_count = counts.get(queue_id, 0)
        percentile_wait = self._queue.get_historical_percentile_wait_single(
            queue_id, booking_date, 0.75, float(DEFAULT_AVG_TIME)
        )
        position = scheduled_count + 1
        wait_minutes = int(position * percentile_wait)
        buffer = int(wait_minutes * 0.20)
        wait_min = max(0, wait_minutes - buffer)
        wait_max = wait_minutes + buffer
        wait_range = f"{wait_min}-{wait_max} min"
        queue = self._queue.get_queue_by_id(queue_id)
        start_time = queue.start_time if queue and queue.start_time else time(9, 0)
        appointment_datetime = datetime.combine(booking_date, start_time) + timedelta(minutes=wait_minutes)
        appointment_time = appointment_datetime.strftime("%H:%M")
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_time,
        }

    def get_existing_queue_user_metrics(self, existing_queue_user: Any) -> Dict:
        """Position, wait time, appointment time for an existing queue user (same-day)."""
        ahead = self._queue.get_queue_user_ahead_metrics(
            queue_id=existing_queue_user.queue_id,
            queue_date=existing_queue_user.queue_date,
            enqueue_time=getattr(existing_queue_user, "enqueue_time", None),
            created_at=getattr(existing_queue_user, "created_at", None),
            exclude_queue_user_id=existing_queue_user.uuid,
        )
        ahead_count = ahead["ahead_count"]
        total_wait_minutes = ahead["total_wait_minutes"]
        percentile_wait = self._queue.get_historical_percentile_wait_single(
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
        current_time = self._now_ist()
        appointment_datetime = current_time + timedelta(minutes=wait_minutes)
        appointment_time = appointment_datetime.strftime("%H:%M")
        return {
            "position": position,
            "wait_minutes": wait_minutes,
            "wait_range": wait_range,
            "appointment_time": appointment_time,
        }
