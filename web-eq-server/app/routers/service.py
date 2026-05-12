from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.db.database import get_db
from app.controllers.service_controller import ServiceController
from app.schemas.service import ServiceData


service_router = APIRouter()


@service_router.get("/get_services", response_model=List[ServiceData])
async def get_services_by_categories(
    category_ids: List[UUID] = Query(..., description="One or more subcategory UUIDs"),
    db: Session = Depends(get_db),
):
    controller = ServiceController(db)
    return await controller.get_services_by_categories(category_ids)


@service_router.get("/get_all_services", response_model=List[ServiceData])
async def get_all_services(db: Session = Depends(get_db)):
    controller = ServiceController(db)
    return await controller.get_all_services()


@service_router.get("/get_services_by_business/{business_id}", response_model=List[ServiceData])
async def get_services_by_business(business_id: UUID, db: Session = Depends(get_db)):
    controller = ServiceController(db)
    return await controller.get_services_by_business(business_id)
