from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.db.database import get_db
from app.controllers.service_controller import ServiceController
from app.schemas.service import ServiceData


service_router = APIRouter()


@service_router.get("/get_services/{category_id}", response_model=List[ServiceData])
async def get_available_services(category_id: UUID, db: Session = Depends(get_db)):
    controller = ServiceController(db)
    return await controller.get_available_services(category_id)
