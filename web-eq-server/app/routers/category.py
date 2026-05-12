from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.category_controller import CategoryController
from app.schemas.category import CategoryData, CategoryTreeNode, SubcategoryMinimal


category_router = APIRouter()


@category_router.get("/get_categories", response_model=List[CategoryData])
async def get_categories(db: Session = Depends(get_db)) -> List[CategoryData]:
    controller: CategoryController = CategoryController(db)
    return controller.get_all_categories()


@category_router.get("/subcategories", response_model=List[SubcategoryMinimal])
async def get_subcategories(
    parent_uuid: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
) -> List[SubcategoryMinimal]:
    controller = CategoryController(db)
    return controller.get_subcategories_minimal(parent_uuid)


@category_router.get("/tree", response_model=List[CategoryTreeNode])
async def get_categories_tree(
    parent_uuid: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    controller = CategoryController(db)
    return controller.get_categories_tree(parent_uuid)
