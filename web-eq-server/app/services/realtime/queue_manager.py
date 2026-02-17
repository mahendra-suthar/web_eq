import logging
from fastapi import WebSocket
from starlette.websockets import WebSocketState
from sqlalchemy.orm import Session
from typing import List, Dict, Optional, Any
from collections import defaultdict
from datetime import datetime, date, timedelta, time
from uuid import UUID
from enum import Enum
import pytz

from app.services.queue_service import QueueService
from app.core.constants import TIMEZONE
from app.core.config import REDIS_URL, MAX_QUEUE_SIZE

logger = logging.getLogger(__name__)


class QueueStatus(str, Enum):
    REGISTERED = "registered"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELED = "canceled"


class QueueManager:
    """
    Manages real-time queue state using Redis and broadcasts updates via WebSocket.
    Designed for customer booking flow - scoped per business.
    """
    
    def __init__(self, redis_url: str, max_queue_size: int = 50):
        self.redis_url = redis_url
        self.redis: Any = None
        self.max_queue_size = max_queue_size
        self.avg_wait_time_per_user = 5  # minutes
        self.ist = pytz.timezone(TIMEZONE)
        
        # WebSocket connections: {business_id:date -> [websocket, ...]}
        self.websocket_clients: Dict[str, List[WebSocket]] = defaultdict(list)
    
    # ─────────────────────────────────────────────────────────────────────────
    # Redis Connection
    # ─────────────────────────────────────────────────────────────────────────
    
    async def connect_to_redis(self):
        """Initialize Redis connection."""
        if not self.redis:
            try:
                # Use redis.asyncio instead of aioredis to avoid TimeoutError conflict
                from redis import asyncio as aioredis
                self.redis = await aioredis.from_url(
                    self.redis_url,
                    decode_responses=True,
                    max_connections=10
                )
                logger.info("Connected to Redis successfully")
            except ImportError:
                logger.warning("redis package not available. Running without Redis (in-memory mode).")
                self.redis = None
            except Exception as e:
                logger.error(f"Failed to connect to Redis: {e}")
                # Continue without Redis - use in-memory fallback
                self.redis = None
    
    def get_current_ist_time(self) -> datetime:
        """Get current time in IST timezone."""
        return datetime.now(self.ist)
    
    # ─────────────────────────────────────────────────────────────────────────
    # WebSocket Management
    # ─────────────────────────────────────────────────────────────────────────
    
    async def connect_websocket(
        self, 
        db: Session,
        business_id: str, 
        date_str: str, 
        websocket: WebSocket,
        user_id: Optional[str] = None
    ) -> WebSocket:
        """Connect a WebSocket client to receive business queue updates."""
        ws_key = f"{business_id}:{date_str}"
        
        if websocket.client_state != WebSocketState.CONNECTED:
            await websocket.accept()
        
        # Store connection with user context
        websocket.user_id = user_id  # type: ignore
        self.websocket_clients[ws_key].append(websocket)
        
        logger.info(f"WebSocket connected: business={business_id}, date={date_str}, user={user_id}")
        
        # Send initial state
        try:
            initial_data = await self.get_business_queue_state(db, business_id, date_str)
            await websocket.send_json({
                "type": "initial_state",
                "data": initial_data,
                "timestamp": self.get_current_ist_time().isoformat()
            })
        except Exception as e:
            logger.error(f"Error sending initial state: {e}")
        
        return websocket
    
    async def disconnect_websocket(self, business_id: str, date_str: str, websocket: WebSocket):
        """Disconnect a WebSocket client."""
        ws_key = f"{business_id}:{date_str}"
        if ws_key in self.websocket_clients:
            self.websocket_clients[ws_key] = [
                ws for ws in self.websocket_clients[ws_key] if ws != websocket
            ]
            logger.info(f"WebSocket disconnected: business={business_id}, date={date_str}")
    
    async def broadcast_to_business(self, business_id: str, date_str: str, message: Dict):
        """Broadcast message to all WebSocket clients for a business/date."""
        ws_key = f"{business_id}:{date_str}"
        clients = self.websocket_clients.get(ws_key, [])
        
        disconnected = []
        for websocket in clients:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
                else:
                    disconnected.append(websocket)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")
                disconnected.append(websocket)
        
        # Clean up disconnected clients
        for ws in disconnected:
            await self.disconnect_websocket(business_id, date_str, ws)
    
    # ─────────────────────────────────────────────────────────────────────────
    # Queue State Management (Redis)
    # ─────────────────────────────────────────────────────────────────────────
    
    async def get_queue_length(self, queue_id: str, date_str: str) -> int:
        """Get current queue length from Redis."""
        if not self.redis:
            return 0
        
        key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.REGISTERED.value}"
        try:
            length = await self.redis.llen(key)
            return length
        except Exception:
            return 0
    
    async def get_queue_position(self, queue_id: str, date_str: str, user_id: str) -> Optional[int]:
        """Get user's position in queue."""
        if not self.redis:
            return None
        
        key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.REGISTERED.value}"
        try:
            users = await self.redis.lrange(key, 0, -1)
            if user_id in users:
                return users.index(user_id) + 1
            return None
        except Exception:
            return None
    
    async def add_to_queue(
        self, 
        db: Session,
        queue_id: str, 
        user_id: str, 
        date_str: str,
        token_number: str,
        total_service_time: int,  # in minutes
        business_id: str
    ) -> Dict:
        """Add a user to the queue and broadcast update."""
        if self.redis:
            key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.REGISTERED.value}"
            
            # Check if already in queue
            existing = await self.redis.lrange(key, 0, -1)
            if user_id in existing:
                return {"status": "exists", "message": "Already in queue"}
            
            # Add to queue
            await self.redis.rpush(key, user_id)
            
            # Store user details
            user_key = f"user:{queue_id}:{date_str}:{user_id}"
            await self.redis.hset(user_key, mapping={
                "token_number": token_number,
                "total_time": str(total_service_time * 60),  # Convert to seconds
                "status": QueueStatus.REGISTERED.value,
                "created_at": self.get_current_ist_time().isoformat()
            })
        
        # Calculate position and wait time
        position = await self.get_queue_length(queue_id, date_str)
        wait_time = await self.calculate_wait_time(queue_id, date_str, position)
        
        # Broadcast update to all clients
        await self.notify_queue_update(db, business_id, date_str)
        
        return {
            "status": "added",
            "position": position,
            "estimated_wait_minutes": wait_time,
            "token_number": token_number
        }
    
    async def calculate_wait_time(self, queue_id: str, date_str: str, position: int) -> int:
        """Calculate estimated wait time based on queue position and service times."""
        if not self.redis or position <= 0:
            return 0
        
        key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.REGISTERED.value}"
        try:
            users = await self.redis.lrange(key, 0, position - 1)
            total_wait = 0
            
            for user_id in users:
                user_key = f"user:{queue_id}:{date_str}:{user_id}"
                user_data = await self.redis.hgetall(user_key)
                total_time = int(user_data.get("total_time", self.avg_wait_time_per_user * 60))
                total_wait += total_time / 60  # Convert to minutes
            
            return int(total_wait)
        except Exception:
            return position * self.avg_wait_time_per_user
    
    async def get_queue_metrics_for_calculation(
        self, queue_id: str, date_str: str
    ) -> Dict:
        """
        Get raw metrics from Redis for BookingCalculationService.
        Returns registered count, in-progress count, and total active users.
        """
        registered_count = await self.get_queue_length(queue_id, date_str)
        in_progress_count = await self.get_in_progress_count(queue_id, date_str)
        
        return {
            "registered_count": registered_count,
            "in_progress_count": in_progress_count,
            "total_active": registered_count + in_progress_count
        }
    
    async def get_in_progress_count(self, queue_id: str, date_str: str) -> int:
        """Count users currently being served (in-progress status)"""
        if not self.redis:
            return 0
        
        key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.IN_PROGRESS.value}"
        try:
            return await self.redis.llen(key)
        except Exception:
            return 0
    
    # ─────────────────────────────────────────────────────────────────────────
    # Business Queue State (Aggregated for all queues)
    # ─────────────────────────────────────────────────────────────────────────
    
    async def get_business_queue_state(self, db: Session, business_id: str, date_str: str) -> Dict:
        """Get aggregated queue state for all queues of a business."""
        queues = QueueService(db).get_queues_by_business_id(UUID(business_id))
        
        queue_states = []
        for queue in queues:
            queue_id = str(queue.uuid)
            length = await self.get_queue_length(queue_id, date_str)
            
            # Get in-progress user if any
            current_user = None
            if self.redis:
                in_progress_key = f"queue:{queue_id}:{date_str}:status:{QueueStatus.IN_PROGRESS.value}"
                current = await self.redis.lindex(in_progress_key, 0)
                if current:
                    user_key = f"user:{queue_id}:{date_str}:{current}"
                    current_user = await self.redis.hgetall(user_key)
            
            queue_states.append({
                "queue_id": queue_id,
                "queue_name": queue.name,
                "current_length": length,
                "limit": queue.limit or self.max_queue_size,
                "available": length < (queue.limit or self.max_queue_size),
                "current_token": current_user.get("token_number") if current_user else None,
                "estimated_wait_minutes": await self.calculate_wait_time(queue_id, date_str, length + 1)
            })
        
        return {
            "business_id": business_id,
            "date": date_str,
            "queues": queue_states,
            "total_waiting": sum(q["current_length"] for q in queue_states)
        }
    
    async def notify_queue_update(self, db: Session, business_id: str, date_str: str):
        """Notify all connected clients about queue state change."""
        state = await self.get_business_queue_state(db, business_id, date_str)
        
        await self.broadcast_to_business(business_id, date_str, {
            "type": "queue_update",
            "data": state,
            "timestamp": self.get_current_ist_time().isoformat()
        })
    
    # ─────────────────────────────────────────────────────────────────────────
    # Available Slots Calculation
    # ─────────────────────────────────────────────────────────────────────────
    
    async def get_available_slots(
        self, 
        db: Session, 
        business_id: str, 
        date_str: str,
        service_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """
        Get available slots for booking.
        Returns queues that can serve the selected services with availability info.
        """
        queue_svc = QueueService(db)
        queues = queue_svc.get_queues_by_business_id(UUID(business_id))
        if not queues:
            return []

        queue_to_service_ids = queue_svc.get_queue_to_service_ids([q.uuid for q in queues])
        queue_service_id_strs_map = {
            qid: [str(sid) for sid in sids]
            for qid, sids in queue_to_service_ids.items()
        }

        available_slots = []
        for queue in queues:
            queue_id = str(queue.uuid)
            queue_uuid = queue.uuid

            # Check if queue offers the selected services
            if service_ids:
                queue_service_id_strs = queue_service_id_strs_map.get(queue_uuid, [])
                if not any(sid in queue_service_id_strs for sid in service_ids):
                    continue
            
            # Get current queue state
            length = await self.get_queue_length(queue_id, date_str)
            limit = queue.limit or self.max_queue_size
            available = length < limit
            
            # Calculate wait time
            wait_time = await self.calculate_wait_time(queue_id, date_str, length + 1)
            
            # Calculate estimated appointment time
            current_time = self.get_current_ist_time()
            appointment_time = current_time + timedelta(minutes=wait_time)
            
            available_slots.append({
                "queue_id": queue_id,
                "queue_name": queue.name,
                "date": date_str,
                "available": available,
                "current_position": length,
                "capacity": limit,
                "estimated_wait_minutes": wait_time,
                "estimated_appointment_time": appointment_time.strftime("%H:%M"),
                "status": "Available" if available else "Full"
            })
        
        return available_slots
    
    # ─────────────────────────────────────────────────────────────────────────
    # Token Generation
    # ─────────────────────────────────────────────────────────────────────────
    
    async def generate_token_number(self, queue_id: str, date_str: str) -> str:
        """Generate next token number for a queue."""
        if self.redis:
            key = f"queue:{queue_id}:{date_str}:last_token"
            token_num = await self.redis.incr(key)
            return f"T{token_num:03d}"
        else:
            # Fallback: use timestamp-based token
            return f"T{datetime.now().strftime('%H%M%S')}"


# Global instance
queue_manager = QueueManager(redis_url=REDIS_URL, max_queue_size=MAX_QUEUE_SIZE)
