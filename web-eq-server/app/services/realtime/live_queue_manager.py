"""
LiveQueueManager – employee-facing, queue-scoped real-time state.

Keyed on  {queue_id}:{date_str}  (vs. QueueManager which is {business_id}:{date}).
No Redis dependency – purely in-memory WebSocket broadcast + DB read for state.
"""
import logging
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import WebSocket
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

from app.core.utils import build_live_queue_users_raw, live_queue_key, now_iso, serialise_dt

logger = logging.getLogger(__name__)


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
                "data": state,
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
            "data": data,
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
        from app.services.queue_service import QueueService  # local import → avoid circular
        from app.core.constants import (
            QUEUE_USER_REGISTERED,
            QUEUE_USER_IN_PROGRESS,
            QUEUE_USER_COMPLETED,
        )
        from app.core.utils import format_time_12h, wait_minutes_from_now
        from uuid import UUID

        from app.services.booking_calculation_service import BookingCalculationService

        svc = QueueService(db)
        queue_date = date.fromisoformat(date_str)
        queue = svc.get_queue_by_id(UUID(queue_id))

        rows, svc_by_user = svc.get_live_queue_users_raw(UUID(queue_id), queue_date)
        users = build_live_queue_users_raw(rows, svc_by_user)

        waiting_count = sum(1 for u in users if u["status"] == QUEUE_USER_REGISTERED)
        in_progress_count = sum(1 for u in users if u["status"] == QUEUE_USER_IN_PROGRESS)
        completed_count = sum(1 for u in users if u["status"] == QUEUE_USER_COMPLETED)

        current_token: Optional[str] = None
        for u in users:
            if u["status"] == QUEUE_USER_IN_PROGRESS:
                current_token = u["token"]
                break

        employee_on_leave = False
        if queue:
            calc = BookingCalculationService(db)
            _, _, _, employee_available = calc.get_employee_window(queue, queue_date)
            employee_on_leave = not employee_available

        def _user_payload(u: dict) -> dict:
            est_wait = (
                wait_minutes_from_now(u.get("estimated_enqueue_time"))
                if u["status"] == QUEUE_USER_REGISTERED
                else None
            )
            est_at = (
                format_time_12h(u.get("estimated_dequeue_time"))
                if u["status"] == QUEUE_USER_IN_PROGRESS and u.get("estimated_dequeue_time")
                else format_time_12h(u.get("estimated_enqueue_time"))
                if u["status"] == QUEUE_USER_REGISTERED and u.get("estimated_enqueue_time")
                else None
            )
            return {
                **u,
                "enqueue_time": serialise_dt(u.get("enqueue_time")),
                "dequeue_time": serialise_dt(u.get("dequeue_time")),
                "estimated_wait_minutes": est_wait,
                "estimated_appointment_time": est_at,
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
