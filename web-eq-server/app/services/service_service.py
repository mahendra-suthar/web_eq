from sqlalchemy.orm import Session, load_only
from uuid import UUID
from typing import List

from app.models.service import Service


class ServiceService:
    def __init__(self, db: Session):
        self.db = db

    def get_services_by_category(self, category_id: UUID):
        return (
            self.db.query(Service)
            .options(load_only(Service.uuid, Service.name))
            .filter(Service.category_id == category_id)
            .all()
        )

