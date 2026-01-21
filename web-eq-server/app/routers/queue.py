from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.db.database import get_db
from app.controllers.queue_controller import QueueController
from app.schemas.queue import QueueCreate, QueueData, QueueUserData
from app.schemas.service import ServiceData


queue_router = APIRouter()


@queue_router.post("/create_queue", response_model=QueueData)
async def create_queue(payload: QueueCreate, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.create_queue(payload)

@queue_router.get("/get_queues/{business_id}", response_model=List[QueueData])
async def get_queues(business_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_queues(business_id)

@queue_router.get("/get_business_services/{business_id}", response_model=List[ServiceData])
async def get_business_services(business_id: UUID, db: Session = Depends(get_db)):
    controller = QueueController(db)
    return await controller.get_business_services(business_id)


@queue_router.get("/get_users", response_model=List[QueueUserData])
async def get_queue_users(
    business_id: UUID | None = None,
    queue_id: UUID | None = None,
    employee_id: UUID | None = None,
    page: int = 1,
    limit: int = 10,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    controller = QueueController(db)
    return await controller.get_users(
        business_id=business_id,
        queue_id=queue_id,
        employee_id=employee_id,
        page=page,
        limit=limit,
        search=search,
    )

