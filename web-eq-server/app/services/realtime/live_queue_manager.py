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
    QUEUE_USER_SCHEDULED,
)
from app.services.queue_service import QueueService
from app.services.booking_calculation_service import BookingCalculationService
from uuid import UUID

_APP_TZ = pytz.timezone(TIMEZONE)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Shared wait-calculation helpers — used by LiveQueueManager AND customer API
# ─────────────────────────────────────────────────────────────────────────────

def _scheduled_start_dt(u: dict, ref_date: date) -> Optional[datetime]:
    """Return tz-aware scheduled_start for Fixed/Approximate users; None for walk-ins."""
    if u.get("appointment_type") not in ("FIXED", "APPROXIMATE"):
        return None
    s_str = u.get("scheduled_start")
    if not s_str:
        return None
    try:
        s_time = datetime.strptime(s_str, "%H:%M").time()
        return _APP_TZ.localize(datetime.combine(ref_date, s_time))
    except (ValueError, AttributeError):
        return None


def calculate_queue_waits(
    users: List[dict],
    now: Optional[datetime] = None,
    open_dt: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Cursor-based wait estimation for mixed queues (Fixed + Approximate + Walk-in).

    Fixed/Approximate users claim their scheduled slot; walk-ins fill gaps between
    fixed slots but only when they can finish before the next fixed start time.
    SCHEDULED (not-yet-activated) blocks are treated as time reservations that
    walk-ins must not overlap.

    Returns:
        {
            "current_token":  Optional[str],
            "wait_data":      { "<uuid>": { "expected_at_ts", "estimated_wait_minutes",
                                            "estimated_appointment_time" } },
            "ordered_waiting": List[dict],   # REGISTERED users in correct service order
            "position_map":    { "<uuid>": int },  # 1-based, includes SCHEDULED ahead
        }
    """
    if now is None:
        now = now_app_tz()

    ref_date = open_dt.date() if open_dt is not None else now.date()
    cursor = max(now, open_dt) if open_dt is not None else now

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

    # ── IN_PROGRESS ────────────────────────────────────────────────────────────
    current_token: Optional[str] = None
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
                in_progress_finish_dt = et + timedelta(minutes=turn_time)
            break

    if in_progress_finish_dt:
        cursor = max(cursor, in_progress_finish_dt)

    def _to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = _APP_TZ.localize(dt)
        return int(dt.timestamp() * 1000)

    # ── SCHEDULED blocks (not yet activated — walk-ins must not overlap) ───────
    sched_blocks: List[tuple] = []
    for u in users:
        if u.get("status") == QUEUE_USER_SCHEDULED:
            s_dt = _scheduled_start_dt(u, ref_date)
            if s_dt is not None:
                sched_blocks.append((s_dt, float(u.get("turn_time") or fallback_turn_time)))
    sched_blocks.sort(key=lambda x: x[0])

    def _advance_past_conflicts(cursor_dt: datetime, wu_turn: float) -> datetime:
        # Slide cursor past any SCHEDULED block that overlaps this walk-in's window.
        # Skip condition: s_end <= cursor_dt means block has fully finished — safe.
        # Using s_end (not s_dt) correctly handles cursor landing inside a block.
        for s_dt, s_turn in sched_blocks:
            s_end = s_dt + timedelta(minutes=s_turn)
            if s_end <= cursor_dt:
                continue
            if s_dt < cursor_dt + timedelta(minutes=wu_turn):
                cursor_dt = max(cursor_dt, s_end)
        return cursor_dt

    # ── Split REGISTERED users: Fixed/Approximate vs Walk-in ───────────────────
    registered = [u for u in users if u["status"] == QUEUE_USER_REGISTERED]
    sched_dts: Dict[str, datetime] = {}
    fixed_reg: List[dict] = []
    walkins: List[dict] = []

    for u in registered:
        s_dt = _scheduled_start_dt(u, ref_date)
        if s_dt is not None:
            sched_dts[str(u["uuid"])] = s_dt
            fixed_reg.append(u)
        else:
            walkins.append(u)

    fixed_reg.sort(key=lambda u: sched_dts[str(u["uuid"])])

    def _safe_enqueue_key(u: dict) -> datetime:
        et = u.get("enqueue_time")
        if et is None:
            return _APP_TZ.localize(datetime(9999, 1, 1))
        return _APP_TZ.localize(et) if et.tzinfo is None else et.astimezone(_APP_TZ)

    walkins.sort(key=_safe_enqueue_key)

    # ── Cursor-based merge: determine correct service order ────────────────────
    ordered: List[dict] = []
    expected_dts: Dict[str, datetime] = {}
    fi = wi = 0
    cursor_val = cursor

    while fi < len(fixed_reg) or wi < len(walkins):
        if fi >= len(fixed_reg):
            wu = walkins[wi]
            wu_turn = float(wu.get("turn_time") or fallback_turn_time)
            adjusted = _advance_past_conflicts(cursor_val, wu_turn)
            expected_dts[str(wu["uuid"])] = adjusted
            cursor_val = adjusted + timedelta(minutes=wu_turn)
            ordered.append(wu)
            wi += 1
        elif wi >= len(walkins):
            fu = fixed_reg[fi]
            fu_turn = float(fu.get("turn_time") or fallback_turn_time)
            expected = max(cursor_val, sched_dts[str(fu["uuid"])])
            expected_dts[str(fu["uuid"])] = expected
            cursor_val = expected + timedelta(minutes=fu_turn)
            ordered.append(fu)
            fi += 1
        else:
            wu = walkins[wi]
            fu = fixed_reg[fi]
            wu_turn = float(wu.get("turn_time") or fallback_turn_time)
            fu_turn = float(fu.get("turn_time") or fallback_turn_time)
            fixed_start = sched_dts[str(fu["uuid"])]
            adjusted = _advance_past_conflicts(cursor_val, wu_turn)
            if adjusted + timedelta(minutes=wu_turn) <= fixed_start:
                # Walk-in fits in gap before next fixed slot — serve it first
                expected_dts[str(wu["uuid"])] = adjusted
                cursor_val = adjusted + timedelta(minutes=wu_turn)
                ordered.append(wu)
                wi += 1
            else:
                # Fixed appointment takes priority over walk-in
                expected = max(cursor_val, fixed_start)
                expected_dts[str(fu["uuid"])] = expected
                cursor_val = expected + timedelta(minutes=fu_turn)
                ordered.append(fu)
                fi += 1

    # ── Build wait_data ─────────────────────────────────────────────────────────
    wait_data: Dict[str, dict] = {}

    for u in users:
        if u["status"] == QUEUE_USER_IN_PROGRESS:
            in_progress_turn = float(u.get("turn_time") or fallback_turn_time)
            wait_data[str(u["uuid"])] = {
                "expected_at_ts": _to_epoch_ms(in_progress_finish_dt),
                "expected_end_ts": _to_epoch_ms(in_progress_finish_dt),
                "estimated_wait_minutes": None,
                "estimated_appointment_time": format_time_12h(in_progress_finish_dt) if in_progress_finish_dt else None,
                "estimated_end_time": format_time_12h(in_progress_finish_dt) if in_progress_finish_dt else None,
                "service_duration_minutes": int(in_progress_turn),
            }

    for u in ordered:
        exp_dt = expected_dts.get(str(u["uuid"]))
        tu = float(u.get("turn_time") or fallback_turn_time)
        exp_end_dt = exp_dt + timedelta(minutes=tu) if exp_dt else None
        wait_mins = (
            max(0, int(round((exp_dt - now).total_seconds() / 60)))
            if exp_dt else None
        )
        wait_data[str(u["uuid"])] = {
            "expected_at_ts": _to_epoch_ms(exp_dt),
            "expected_end_ts": _to_epoch_ms(exp_end_dt),
            "estimated_wait_minutes": wait_mins,
            "estimated_appointment_time": format_time_12h(exp_dt),
            "estimated_end_time": format_time_12h(exp_end_dt),
            "service_duration_minutes": int(tu),
        }

    for u in users:
        if u["status"] == QUEUE_USER_COMPLETED:
            wait_data[str(u["uuid"])] = {
                "expected_at_ts": None,
                "expected_end_ts": None,
                "estimated_wait_minutes": None,
                "estimated_appointment_time": None,
                "estimated_end_time": None,
                "service_duration_minutes": None,
            }

    # ── Position map: index in service order + any SCHEDULED slots ahead ───────
    # A SCHEDULED slot at 11:45 AM is served before a walk-in at 12:05 PM, so
    # the walk-in's position number must account for it — preventing a confusing
    # jump when that slot activates and becomes REGISTERED.
    position_map: Dict[str, int] = {}
    for i, u in enumerate(ordered):
        exp_dt = expected_dts.get(str(u["uuid"]))
        sched_ahead = sum(
            1 for s_dt, _ in sched_blocks
            if exp_dt is not None and now < s_dt < exp_dt
        )
        position_map[str(u["uuid"])] = i + 1 + sched_ahead

    return {
        "current_token": current_token,
        "wait_data": wait_data,
        "ordered_waiting": ordered,
        "position_map": position_map,
    }


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
        open_dt: Optional[datetime] = None
        if queue:
            calc = BookingCalculationService(db)
            open_time, _, _, employee_available = calc.get_employee_window(queue, queue_date)
            employee_on_leave = not employee_available
            open_dt = _APP_TZ.localize(datetime.combine(queue_date, open_time))

        # Dynamic wait estimation via shared helper
        waits = calculate_queue_waits(users, open_dt=open_dt)
        current_token   = waits["current_token"]
        wait_data       = waits["wait_data"]
        ordered_waiting = waits["ordered_waiting"]
        position_map    = waits["position_map"]

        # Sort users for display: IN_PROGRESS → REGISTERED (correct service order)
        #   → SCHEDULED (by scheduled_start) → COMPLETED
        waiting_rank = {str(u["uuid"]): i for i, u in enumerate(ordered_waiting)}

        def _display_sort(u: dict) -> tuple:
            s = u["status"]
            if s == QUEUE_USER_IN_PROGRESS:
                return (0, 0, "")
            if s == QUEUE_USER_REGISTERED:
                return (1, waiting_rank.get(str(u["uuid"]), 9999), "")
            if s == QUEUE_USER_SCHEDULED:
                return (2, 0, u.get("scheduled_start") or "99:99")
            return (3, 0, "")  # COMPLETED

        display_users = sorted(users, key=_display_sort)

        def _user_payload(u: dict) -> dict:
            wd = wait_data.get(str(u["uuid"]), {})
            return {
                **u,
                "enqueue_time": serialise_dt(u.get("enqueue_time")),
                "dequeue_time": serialise_dt(u.get("dequeue_time")),
                "estimated_enqueue_time": serialise_dt(u.get("estimated_enqueue_time")),
                "estimated_dequeue_time": serialise_dt(u.get("estimated_dequeue_time")),
                "position": position_map.get(str(u["uuid"]), u.get("position")),
                "estimated_wait_minutes": wd.get("estimated_wait_minutes"),
                "estimated_appointment_time": wd.get("estimated_appointment_time"),
                "expected_at_ts": wd.get("expected_at_ts"),
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
            "users": [_user_payload(u) for u in display_users],
        }


# Global singleton
live_queue_manager = LiveQueueManager()
