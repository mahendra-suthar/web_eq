"""
WebSocket endpoint for real-time queue updates.
Scoped per business - customers see all queues for a business.
"""
import asyncio
import json
import logging
from uuid import UUID
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Depends
from starlette.websockets import WebSocketState
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime

from app.db.database import get_db
from app.services.realtime.queue_manager import queue_manager
from app.services.realtime.live_queue_manager import live_queue_manager
from app.core.utils import json_safe
from app.services.realtime.customer_appointment_manager import customer_appointment_manager
from app.services.realtime.customer_queue_manager import customer_queue_manager
from app.models.queue import QueueUser

from app.services.realtime.notification_manager import notification_manager
from app.services.notification_service import NotificationService
from app.schemas.notification import NotificationData, NotificationListResponse
from app.core.config import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_user_from_token(websocket: WebSocket):
    """
    Extract user_id from a WebSocket connection.

    Resolution order:
      1. httpOnly cookie  — browser sends it automatically (SameSite=None; Secure)
      2. ?token= query param — fallback for native/mobile clients
      3. Authorization: Bearer header — fallback for programmatic clients
    """
    token: str | None = None

    # 1. Cookie — try both names (business/employee and customer)
    token = websocket.cookies.get("access_token") or websocket.cookies.get("customer_access_token")

    # 2. Query param fallback (used when proxy doesn't forward cookies for WS upgrades)
    if not token:
        token = websocket.query_params.get("token")

    # 3. Authorization header fallback
    if not token:
        auth_header = websocket.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        return None  # Anonymous connection allowed on some endpoints

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # All tokens use "sub" for the user UUID (set in auth_service.py)
        return payload.get("sub")
    except JWTError as e:
        logger.warning("Invalid token in WebSocket connection: %s", e)
        return None


@router.websocket("/ws/booking/{business_id}/{date}")
async def booking_websocket(
    business_id: str,
    date: str,
    websocket: WebSocket,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for real-time booking page updates.
    
    Clients connect to receive:
    - Initial queue state for all queues of the business
    - Live updates when bookings are made/cancelled
    - Position and wait time updates
    
    URL: ws://host/api/ws/booking/{business_id}/{date}
    Query param: ?token=<jwt_token> (optional, for authenticated users)
    """
    user_id = await get_user_from_token(websocket)
    
    try:
        # Validate date format
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        await websocket.close(code=1003, reason="Invalid date format. Use YYYY-MM-DD")
        return
    
    # Connect to Redis if not already connected
    await queue_manager.connect_to_redis()
    
    # Accept and register WebSocket connection
    try:
        await queue_manager.connect_websocket(
            db=db,
            business_id=business_id,
            date_str=date,
            websocket=websocket,
            user_id=user_id
        )
    except Exception as e:
        logger.error(f"Error connecting WebSocket: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
        return
    
    try:
        # Keep connection alive and handle messages
        while True:
            try:
                # Wait for messages with timeout for ping/pong
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0
                )
                
                # Handle client messages (e.g., ping, refresh request)
                try:
                    data = json.loads(message)
                    
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                    
                    elif data.get("type") == "refresh":
                        # Client requests fresh data
                        state = await queue_manager.get_business_queue_state(db, business_id, date)
                        await websocket.send_json({
                            "type": "queue_update",
                            "data": state,
                            "timestamp": datetime.now().isoformat()
                        })
                except json.JSONDecodeError:
                    pass
                
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        break
                        
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: business={business_id}, date={date}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await queue_manager.disconnect_websocket(business_id, date, websocket)


@router.websocket("/ws/live/{queue_id}/{date}")
async def live_queue_websocket(
    queue_id: str,
    date: str,
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """
    Employee WebSocket for real-time live queue updates.

    URL: ws://host/api/ws/live/{queue_id}/{date}
    Query param: ?token=<jwt>  (required for authentication)

    Events sent to client:
      initial_state     – full LiveQueueData on connect
      live_queue_update – after next / new booking / cancel
      queue_started     – after start
      queue_stopped     – after stop
      ping              – keepalive (client should pong or ignore)
    """
    await websocket.accept()

    user_id = await get_user_from_token(websocket)
    if not user_id:
        await websocket.close(code=4001, reason="Authentication required")
        return

    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        await websocket.close(code=1003, reason="Invalid date format. Use YYYY-MM-DD")
        return

    try:
        await live_queue_manager.connect(
            db=db,
            queue_id=queue_id,
            date_str=date,
            websocket=websocket,
        )
    except Exception as e:
        logger.error(f"Error connecting live queue WebSocket: {e}")
        try:
            await websocket.close(code=1011, reason=str(e))
        except Exception:
            pass
        return

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0,
                )
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                    elif data.get("type") == "refresh":
                        state = live_queue_manager.get_live_queue_state(db, queue_id, date)
                        await websocket.send_json({
                            "type": "live_queue_update",
                            "data": json_safe(state),
                            "timestamp": datetime.now().isoformat(),
                        })
                except Exception:
                    pass
            except asyncio.TimeoutError:
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        break
    except WebSocketDisconnect:
        logger.info(f"Live queue WebSocket disconnected: queue={queue_id}, date={date}")
    except Exception as e:
        logger.error(f"Live queue WebSocket error: {e}")
    finally:
        await live_queue_manager.disconnect(queue_id, date, websocket)


@router.websocket("/ws/queue-status/{queue_id}/{date}")
async def customer_queue_status_websocket(
    queue_id: str,
    date: str,
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """
    Customer WebSocket for real-time personal queue position updates.

    URL: ws(s)://host/api/ws/queue-status/{queue_id}/{date}
    Required query params:
      - queue_user_id=<uuid>   the customer's queue user record
      - token=<jwt>            auth (or use httpOnly cookie)

    Events sent to client:
      initial_state          – personal position/wait on connect
      customer_queue_update  – when queue advances (employee clicks Next)
      ping                   – keepalive
    """
    await websocket.accept()

    user_id = await get_user_from_token(websocket)
    if not user_id:
        await websocket.close(code=4001, reason="Authentication required")
        return

    queue_user_id = websocket.query_params.get("queue_user_id")
    if not queue_user_id:
        await websocket.close(code=1003, reason="queue_user_id query param required")
        return

    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        await websocket.close(code=1003, reason="Invalid date format. Use YYYY-MM-DD")
        return

    # Validate that this queue_user belongs to the authenticated user
    try:
        qu = db.query(QueueUser).filter(QueueUser.uuid == UUID(queue_user_id)).first()
        if qu is None or str(qu.user_id) != str(user_id):
            await websocket.close(code=4003, reason="Forbidden")
            return
    except Exception as exc:
        logger.error("CustomerQueueStatus: validation error: %s", exc)
        await websocket.close(code=1011, reason="Internal error")
        return

    try:
        await customer_queue_manager.connect(
            db=db,
            queue_id=queue_id,
            date_str=date,
            queue_user_id=queue_user_id,
            websocket=websocket,
        )
    except Exception as exc:
        logger.error("CustomerQueueStatus: connect error: %s", exc)
        try:
            await websocket.close(code=1011, reason=str(exc))
        except Exception:
            pass
        return

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0,
                )
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
            except asyncio.TimeoutError:
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        break
    except WebSocketDisconnect:
        logger.info("CustomerQueueStatus WS disconnected: queue=%s date=%s user=%s", queue_id, date, queue_user_id)
    except Exception as exc:
        logger.error("CustomerQueueStatus WS error: %s", exc)
    finally:
        await customer_queue_manager.disconnect(queue_id, date, queue_user_id, websocket)


@router.websocket("/ws/notifications/{user_id}")
async def notifications_websocket(
    user_id: str,
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    """
    Per-user notification stream.

    URL: ws(s)://host/api/ws/notifications/{user_id}?token=<jwt>

    Events sent to client:
      initial_state  — NotificationListResponse on connect (newest 20 + unread_count)
      notification   — new notification pushed in real time
      ping           — keepalive (client should pong or ignore)
    """
    await websocket.accept()

    token_user_id = await get_user_from_token(websocket)
    if not token_user_id or token_user_id != user_id:
        await websocket.close(code=4001, reason="Authentication required")
        return

    await notification_manager.connect(user_id, websocket)

    # Send initial state on connect
    try:
        svc = NotificationService(db)
        uid = _UUID(user_id)
        rows, total = svc.get_for_user(uid, limit=20, offset=0)
        unread = svc.get_unread_count(uid)
        initial_data = NotificationListResponse(
            notifications=[NotificationData.from_notification(n) for n in rows],
            total=total,
            unread_count=unread,
            limit=20,
            offset=0,
        )
        await websocket.send_json({
            "type": "initial_state",
            "data": initial_data.model_dump(mode="json"),
            "timestamp": datetime.now().isoformat(),
        })
        logger.info("Sent initial_state to user_id=%s: %d notifications, %d unread", user_id, total, unread)
    except Exception as exc:
        logger.error("Error sending initial notification state for user_id=%s: %s", user_id, exc, exc_info=True)

    try:
        while True:
            try:
                message = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0,
                )
                try:
                    data = json.loads(message)
                    if data.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
            except asyncio.TimeoutError:
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json({"type": "ping"})
                    except Exception:
                        break
    except WebSocketDisconnect:
        logger.info("Notification WebSocket disconnected: user_id=%s", user_id)
    except Exception as e:
        logger.error("Notification WebSocket error: %s", e)
    finally:
        await notification_manager.disconnect(user_id, websocket)
