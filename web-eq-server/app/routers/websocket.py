"""
WebSocket endpoint for real-time queue updates.
Scoped per business - customers see all queues for a business.
"""
import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect, APIRouter, Depends
from starlette.websockets import WebSocketState
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from datetime import datetime

from app.db.database import get_db
from app.services.realtime.queue_manager import queue_manager
from app.core.config import SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

router = APIRouter()


async def get_user_from_token(websocket: WebSocket):
    """Extract user_id from JWT token in query params or headers."""
    # Try query param first
    token = websocket.query_params.get("token")
    if not token:
        # Try Authorization header
        auth_header = websocket.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
    
    if not token:
        # Allow anonymous connections for browsing
        return None
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_data = payload.get("user", {})
        return user_data.get("user_id")
    except JWTError as e:
        logger.warning(f"Invalid token in WebSocket connection: {e}")
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
                    import json
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
