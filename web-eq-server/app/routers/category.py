from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.controllers.category_controller import CategoryController
from app.schemas.category import CategoryData


category_router = APIRouter()


@category_router.get("/get_categories", response_model=List[CategoryData])
async def get_categories(db: Session = Depends(get_db)) -> List[CategoryData]:
    controller = CategoryController(db)
    return controller.get_all_categories()

