"""
LiveQueueManager – employee-facing, queue-scoped real-time state.

Keyed on  {queue_id}:{date_str}  (vs. QueueManager which is {business_id}:{date}).
No Redis dependency – purely in-memory WebSocket broadcast + DB read for state.
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

import pytz
from app.core.utils import build_live_queue_users_raw, live_queue_key, now_iso, now_app_tz, format_time_12h, serialise_dt, json_safe
from app.core.constants import (
    TIMEZONE,
    QUEUE_USER_REGISTERED,
    QUEUE_USER_IN_PROGRESS,
    QUEUE_USER_COMPLETED,
)
from app.services.queue_service import QueueService
from app.services.booking_calculation_service import BookingCalculationService
from uuid import UUID

_APP_TZ = pytz.timezone(TIMEZONE)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Shared wait-calculation helper — used by LiveQueueManager AND customer API
# ─────────────────────────────────────────────────────────────────────────────

def calculate_queue_waits(
    users: List[dict],
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Given a list of queue-user dicts (from build_live_queue_users_raw), compute
    dynamic wait estimates for every user.

    Returns:
        {
            "current_token": Optional[str],          # token currently IN_PROGRESS
            "wait_data": {
                "<uuid>": {
                    "expected_at_ts":          Optional[int],   # epoch ms
                    "estimated_wait_minutes":  Optional[int],
                    "estimated_appointment_time": Optional[str],  # "2:30 PM"
                }
            }
        }
    """
    if now is None:
        now = now_app_tz()

    # Self-adapting fallback turn_time
    completed_times = [
        u["turn_time"] for u in users
        if u["status"] == QUEUE_USER_COMPLETED and (u.get("turn_time") or 0) > 0
    ]
    waiting_times = [
        u["turn_time"] for u in users
        if u["status"] == QUEUE_USER_REGISTERED and (u.get("turn_time") or 0) > 0
    ]
    fallback_turn_time: float = (
        sum(completed_times) / len(completed_times) if completed_times
        else sum(waiting_times) / len(waiting_times) if waiting_times
        else 15.0
    )

    # Remaining time for the customer currently being served
    current_token: Optional[str] = None
    in_progress_remaining: float = 0.0
    in_progress_finish_dt: Optional[datetime] = None

    for u in users:
        if u["status"] == QUEUE_USER_IN_PROGRESS:
            current_token = u.get("token")
            enqueue_time = u.get("enqueue_time")
            turn_time = float(u.get("turn_time") or fallback_turn_time)
            if enqueue_time:
                et = enqueue_time
                if et.tzinfo is None:
                    et = _APP_TZ.localize(et)
                else:
                    et = et.astimezone(_APP_TZ)
                elapsed = (now - et).total_seconds() / 60
                in_progress_remaining = max(0.0, turn_time - elapsed)
                in_progress_finish_dt = et + timedelta(minutes=turn_time)
            break

    # Build per-user wait data
    def _to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = _APP_TZ.localize(dt)
        return int(dt.timestamp() * 1000)

    waiting_sorted = sorted(
        [u for u in users if u["status"] == QUEUE_USER_REGISTERED],
        key=lambda u: u.get("position") or 0,
    )

    wait_data: Dict[str, dict] = {}
    cumulative: float = in_progress_remaining

    # IN_PROGRESS user
    for u in users:
        if u["status"] == QUEUE_USER_IN_PROGRESS:
            wait_data[str(u["uuid"])] = {
                "expected_at_ts": _to_epoch_ms(in_progress_finish_dt),
                "estimated_wait_minutes": None,
                "estimated_appointment_time": format_time_12h(in_progress_finish_dt) if in_progress_finish_dt else None,
            }

    # WAITING users — cumulative
    for wu in waiting_sorted:
        expected_dt = now + timedelta(minutes=cumulative)
        wait_data[str(wu["uuid"])] = {
            "expected_at_ts": _to_epoch_ms(expected_dt),
            "estimated_wait_minutes": max(0, int(round(cumulative))),
            "estimated_appointment_time": format_time_12h(expected_dt),
        }
        cumulative += float(wu.get("turn_time") or fallback_turn_time)

    # COMPLETED users — no estimates
    for u in users:
        if u["status"] == QUEUE_USER_COMPLETED:
            wait_data[str(u["uuid"])] = {
                "expected_at_ts": None,
                "estimated_wait_minutes": None,
                "estimated_appointment_time": None,
            }

    return {"current_token": current_token, "wait_data": wait_data}


class LiveQueueManager:
    """Manages employee WebSocket connections for a single queue's live view."""

    def __init__(self) -> None:
        # { "{queue_id}:{date_str}": [WebSocket, ...] }
        self._clients: Dict[str, List[WebSocket]] = defaultdict(list)

    # ─────────────────────────────────────────────────────────────────────────
    # Connection management
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(
        self,
        db: Session,
        queue_id: str,
        date_str: str,
        websocket: WebSocket,
    ) -> None:
        """Accept websocket, send initial live queue state, register client."""
        if websocket.client_state != WebSocketState.CONNECTED:
            await websocket.accept()

        key = live_queue_key(queue_id, date_str)
        self._clients[key].append(websocket)
        logger.info("LiveQueue WS connected: queue=%s date=%s", queue_id, date_str)

        try:
            state = self.get_live_queue_state(db, queue_id, date_str)
            await websocket.send_json({
                "type": "initial_state",
                "data": json_safe(state),
                "timestamp": now_iso(),
            })
        except Exception as exc:
            logger.error("Error sending initial live queue state: %s", exc)

    async def disconnect(
        self, queue_id: str, date_str: str, websocket: WebSocket
    ) -> None:
        key = live_queue_key(queue_id, date_str)
        self._clients[key] = [ws for ws in self._clients[key] if ws is not websocket]
        logger.info("LiveQueue WS disconnected: queue=%s date=%s", queue_id, date_str)

    # ─────────────────────────────────────────────────────────────────────────
    # Broadcast
    # ─────────────────────────────────────────────────────────────────────────

    async def broadcast(
        self,
        queue_id: str,
        date_str: str,
        event_type: str,
        data: Any,
    ) -> None:
        """Send event to all connected employees watching this queue + date."""
        key = live_queue_key(queue_id, date_str)
        clients = list(self._clients.get(key, []))
        if not clients:
            return

        message = {
            "type": event_type,
            "data": json_safe(data),
            "timestamp": now_iso(),
        }
        stale: List[WebSocket] = []
        for ws in clients:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_json(message)
                else:
                    stale.append(ws)
            except Exception as exc:
                logger.warning("LiveQueue broadcast error: %s", exc)
                stale.append(ws)

        for ws in stale:
            await self.disconnect(queue_id, date_str, ws)

    # ─────────────────────────────────────────────────────────────────────────
    # State builder
    # ─────────────────────────────────────────────────────────────────────────

    def get_live_queue_state(
        self, db: Session, queue_id: str, date_str: str
    ) -> Dict[str, Any]:
        """
        Build a JSON-serialisable LiveQueueData dict.
        Delegates DB queries to QueueService – no queries here.
        """
        svc = QueueService(db)
        queue_date = date.fromisoformat(date_str)
        queue = svc.get_queue_by_id(UUID(queue_id))

        rows, svc_by_user = svc.get_live_queue_users_raw(UUID(queue_id), queue_date)
        users = build_live_queue_users_raw(rows, svc_by_user)

        waiting_count = sum(1 for u in users if u["status"] == QUEUE_USER_REGISTERED)
        in_progress_count = sum(1 for u in users if u["status"] == QUEUE_USER_IN_PROGRESS)
        completed_count = sum(1 for u in users if u["status"] == QUEUE_USER_COMPLETED)

        employee_on_leave = False
        if queue:
            calc = BookingCalculationService(db)
            _, _, _, employee_available = calc.get_employee_window(queue, queue_date)
            employee_on_leave = not employee_available

        # Dynamic wait estimation via shared helper
        waits = calculate_queue_waits(users)
        current_token = waits["current_token"]
        wait_data = waits["wait_data"]

        def _user_payload(u: dict) -> dict:
            wd = wait_data.get(str(u["uuid"]), {})
            return {
                **u,
                "enqueue_time": serialise_dt(u.get("enqueue_time")),
                "dequeue_time": serialise_dt(u.get("dequeue_time")),
                "estimated_enqueue_time": serialise_dt(u.get("estimated_enqueue_time")),
                "estimated_dequeue_time": serialise_dt(u.get("estimated_dequeue_time")),
                "estimated_wait_minutes": wd.get("estimated_wait_minutes"),
                "estimated_appointment_time": wd.get("estimated_appointment_time"),
                "expected_at_ts": wd.get("expected_at_ts"),  # epoch ms — drift-free client countdown
            }

        return {
            "queue_id": queue_id,
            "queue_name": queue.name if queue else "",
            "queue_status": queue.status if queue else None,
            "date": date_str,
            "waiting_count": waiting_count,
            "in_progress_count": in_progress_count,
            "completed_count": completed_count,
            "current_token": current_token,
            "employee_on_leave": employee_on_leave,
            "users": [_user_payload(u) for u in users],
        }


# Global singleton
live_queue_manager = LiveQueueManager()
