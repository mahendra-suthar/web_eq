"""
CustomerQueueManager – customer-facing, per-queue real-time position updates.

Keyed on {queue_id}:{date_str}.
Each customer connects with their queue_user_id — they only receive their own data.
No Redis dependency — purely in-memory WebSocket broadcast.
"""
import logging
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import WebSocket
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketState

from app.core.utils import build_live_queue_users_raw, live_queue_key, now_iso
from app.services.realtime.live_queue_manager import calculate_queue_waits
from app.services.queue_service import QueueService

logger = logging.getLogger(__name__)


class CustomerQueueManager:
    """
    Holds per-user WebSocket connections for customers tracking their queue position.

    Key: "{queue_id}:{date_str}"
    Value: { queue_user_id (str): [WebSocket, ...] }
    """

    def __init__(self) -> None:
        # { "{queue_id}:{date_str}": { queue_user_id: [WebSocket, ...] } }
        self._clients: Dict[str, Dict[str, List[WebSocket]]] = defaultdict(lambda: defaultdict(list))

    # ─────────────────────────────────────────────────────────────────────────
    # Connection management
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(
        self,
        db: Session,
        queue_id: str,
        date_str: str,
        queue_user_id: str,
        websocket: WebSocket,
    ) -> None:
        """Accept WebSocket, register client, send initial personal queue state."""
        if websocket.client_state != WebSocketState.CONNECTED:
            await websocket.accept()

        key = live_queue_key(queue_id, date_str)
        self._clients[key][queue_user_id].append(websocket)
        logger.info(
            "CustomerQueue WS connected: queue=%s date=%s queue_user=%s",
            queue_id, date_str, queue_user_id,
        )

        try:
            payload = self._get_user_status(db, queue_id, date_str, queue_user_id)
            await websocket.send_json({
                "type": "initial_state",
                "data": payload,
                "timestamp": now_iso(),
            })
        except Exception as exc:
            logger.error("Error sending initial customer queue state: %s", exc)

    async def disconnect(
        self,
        queue_id: str,
        date_str: str,
        queue_user_id: str,
        websocket: WebSocket,
    ) -> None:
        key = live_queue_key(queue_id, date_str)
        user_sockets = self._clients[key]
        user_sockets[queue_user_id] = [
            ws for ws in user_sockets[queue_user_id] if ws is not websocket
        ]
        if not user_sockets[queue_user_id]:
            del user_sockets[queue_user_id]
        if not user_sockets:
            del self._clients[key]
        logger.info(
            "CustomerQueue WS disconnected: queue=%s date=%s queue_user=%s",
            queue_id, date_str, queue_user_id,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Broadcast — called from queue_controller after every queue action
    # ─────────────────────────────────────────────────────────────────────────

    async def broadcast_to_queue(
        self,
        db: Session,
        queue_id: str,
        date_str: str,
    ) -> None:
        """
        Recalculate wait data for all connected customers in this queue and push
        a personalised `customer_queue_update` to each one.
        """
        key = live_queue_key(queue_id, date_str)
        user_map = self._clients.get(key, {})
        if not user_map:
            return

        # One DB call for all connected customers
        try:
            waits = self._build_waits(db, queue_id, date_str)
        except Exception as exc:
            logger.error("CustomerQueueManager: failed to build waits: %s", exc)
            return

        stale: List[tuple] = []  # (queue_user_id, websocket)
        for queue_user_id, sockets in list(user_map.items()):
            payload = waits.get(queue_user_id) or {
                "queue_user_id": queue_user_id,
                "position": None,
                "expected_at_ts": None,
                "estimated_wait_minutes": None,
                "estimated_appointment_time": None,
                "current_token": waits.get("__current_token__"),
                "status": None,
            }
            message = {
                "type": "customer_queue_update",
                "data": payload,
                "timestamp": now_iso(),
            }
            for ws in list(sockets):
                try:
                    if ws.client_state == WebSocketState.CONNECTED:
                        await ws.send_json(message)
                    else:
                        stale.append((queue_user_id, ws))
                except Exception as exc:
                    logger.warning("CustomerQueue broadcast error: %s", exc)
                    stale.append((queue_user_id, ws))

        for queue_user_id, ws in stale:
            await self.disconnect(queue_id, date_str, queue_user_id, ws)

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _build_waits(
        self, db: Session, queue_id: str, date_str: str
    ) -> Dict[str, Any]:
        """
        Returns a dict keyed by queue_user_id (str) with personalised wait data,
        plus "__current_token__" for the token currently being served.
        """
        svc = QueueService(db)
        queue_date = date.fromisoformat(date_str)
        rows, svc_by_user = svc.get_live_queue_users_raw(UUID(queue_id), queue_date)
        users = build_live_queue_users_raw(rows, svc_by_user)

        waits = calculate_queue_waits(users)
        current_token = waits["current_token"]
        wait_data = waits["wait_data"]

        result: Dict[str, Any] = {}
        for u in users:
            uid = str(u["uuid"])
            wd = wait_data.get(uid, {})
            result[uid] = {
                "queue_user_id": uid,
                "position": u.get("position"),
                "status": u.get("status"),
                "expected_at_ts": wd.get("expected_at_ts"),
                "estimated_wait_minutes": wd.get("estimated_wait_minutes"),
                "estimated_appointment_time": wd.get("estimated_appointment_time"),
                "current_token": current_token,
            }

        result["__current_token__"] = current_token
        return result

    def _get_user_status(
        self, db: Session, queue_id: str, date_str: str, queue_user_id: str
    ) -> Dict[str, Any]:
        waits = self._build_waits(db, queue_id, date_str)
        return waits.get(queue_user_id) or {
            "queue_user_id": queue_user_id,
            "position": None,
            "status": None,
            "expected_at_ts": None,
            "estimated_wait_minutes": None,
            "estimated_appointment_time": None,
            "current_token": waits.get("__current_token__"),
        }


# Global singleton
customer_queue_manager = CustomerQueueManager()
