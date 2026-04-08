"""
NotificationManager – user-scoped WebSocket hub for real-time notification delivery.

Structurally mirrors CustomerAppointmentManager: keyed by user_id (str),
holds in-memory WebSocket connections, pushes JSON messages.
Notifications are persisted to DB by notification_triggers.py before push —
this manager only handles the live delivery channel.
"""
import logging
from collections import defaultdict
from typing import Any, Dict, List

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.core.utils import now_iso

logger = logging.getLogger(__name__)


class NotificationManager:
    def __init__(self) -> None:
        self._clients: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        self._clients[user_id].append(websocket)
        logger.info("Notification WS connected: user_id=%s", user_id)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        self._clients[user_id] = [
            ws for ws in self._clients[user_id] if ws is not websocket
        ]
        if not self._clients[user_id]:
            self._clients.pop(user_id, None)
        logger.info("Notification WS disconnected: user_id=%s", user_id)

    async def push_to_user(self, user_id: str, payload: Any) -> None:
        clients = list(self._clients.get(user_id, []))
        if not clients:
            return

        message = {
            "type": "notification",
            "data": payload,
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
                logger.warning("Notification push error for user %s: %s", user_id, exc)
                stale.append(ws)

        for ws in stale:
            self._clients[user_id] = [
                w for w in self._clients[user_id] if w is not ws
            ]
        if not self._clients.get(user_id):
            self._clients.pop(user_id, None)


notification_manager = NotificationManager()
