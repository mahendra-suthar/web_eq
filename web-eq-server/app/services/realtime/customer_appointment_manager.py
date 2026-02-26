"""
CustomerAppointmentManager – user-scoped WebSocket for today's appointment updates.

Keyed by user_id. Send delta/initial payload when queue state changes (position, status, etc.).
"""
import logging
from collections import defaultdict
from typing import Any, Dict, List

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.core.utils import now_iso

logger = logging.getLogger(__name__)


class CustomerAppointmentManager:
    """Holds WebSocket connections per user_id for customer appointment updates."""

    def __init__(self) -> None:
        # user_id (str) -> list of WebSocket
        self._clients: Dict[str, List[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Register a client for this user_id."""
        if websocket.client_state != WebSocketState.CONNECTED:
            await websocket.accept()
        self._clients[user_id].append(websocket)
        logger.info("Customer appointment WS connected: user_id=%s", user_id)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Unregister a client."""
        self._clients[user_id] = [ws for ws in self._clients[user_id] if ws is not websocket]
        if not self._clients[user_id]:
            del self._clients[user_id]
        logger.info("Customer appointment WS disconnected: user_id=%s", user_id)

    async def broadcast_to_user(self, user_id: str, payload: Any) -> None:
        """
        Send appointment update to all connected clients for this user.
        payload: dict (e.g. CustomerTodayAppointmentResponse.model_dump()) or None to signal "no appointment".
        """
        clients = list(self._clients.get(user_id, []))
        if not clients:
            return

        message = {
            "type": "appointment_update",
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
                logger.warning("Customer appointment broadcast error: %s", exc)
                stale.append(ws)
        for ws in stale:
            self._clients[user_id] = [w for w in self._clients[user_id] if w is not ws]
        if not self._clients.get(user_id):
            del self._clients[user_id]


customer_appointment_manager = CustomerAppointmentManager()
