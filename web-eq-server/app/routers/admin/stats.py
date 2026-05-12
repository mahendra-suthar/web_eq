from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.admin_controller import AdminController
from app.schemas.super_admin import AdminStats

stats_router = APIRouter()


@stats_router.get("/stats", response_model=AdminStats)
def get_stats(db: Session = Depends(get_db)):
    return AdminController(db).get_stats()
