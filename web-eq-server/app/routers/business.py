from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.business_controller import BusinessController
from app.schemas.business import BusinessBasicInfoInput, BusinessData


business_router = APIRouter()


@business_router.post("/create_basic_info", response_model=BusinessData)
async def create_business_basic_info(payload: BusinessBasicInfoInput, db: Session = Depends(get_db)):
    controller = BusinessController(db)
    return await controller.create_business_basic_info(payload)
