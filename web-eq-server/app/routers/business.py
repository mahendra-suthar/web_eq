from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.db.database import get_db
from app.controllers.business_controller import BusinessController
from app.middleware.permissions import get_current_user
from app.models.user import User
from app.schemas.business import (
    BusinessBasicInfoInput,
    BusinessBasicInfoUpdate,
    BusinessData,
    BusinessListItem,
    BusinessDetailData,
    BusinessServiceData,
)


business_router = APIRouter()


@business_router.post("/create_basic_info", response_model=BusinessData)
async def create_business_basic_info(payload: BusinessBasicInfoInput, db: Session = Depends(get_db)):
    controller = BusinessController(db)
    return await controller.create_business_basic_info(payload)


@business_router.put("/update_basic_info", response_model=BusinessData)
async def update_business_basic_info(
    payload: BusinessBasicInfoUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = BusinessController(db)
    return await controller.update_business_basic_info(payload, user)


@business_router.get("/get_businesses", response_model=List[BusinessListItem])
async def get_businesses(
    category_id: Optional[UUID] = Query(None),
    service_ids: Optional[List[UUID]] = Query(None),
    db: Session = Depends(get_db)
) -> List[BusinessListItem]:
    controller: BusinessController = BusinessController(db)
    return controller.get_businesses(category_id=category_id, service_ids=service_ids)


@business_router.get("/get_business_details/{business_id}", response_model=BusinessDetailData)
async def get_business_details(business_id: UUID, db: Session = Depends(get_db)) -> BusinessDetailData:
    controller = BusinessController(db)
    return controller.get_business_details(business_id)


@business_router.get("/get_business_services/{business_id}", response_model=List[BusinessServiceData])
async def get_business_services(business_id: UUID, db: Session = Depends(get_db)) -> List[BusinessServiceData]:
    controller = BusinessController(db)
    return controller.get_business_services(business_id)
