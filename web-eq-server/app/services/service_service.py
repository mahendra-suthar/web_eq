from sqlalchemy.orm import Session
from uuid import UUID
from typing import List

from app.models.service import Service
from app.models.business import Business


class ServiceService:
    def __init__(self, db: Session):
        self.db = db

    def get_services_by_categories(self, category_ids: List[UUID]) -> List[Service]:
        if not category_ids:
            return []
        return (
            self.db.query(Service)
            .filter(Service.category_id.in_(category_ids))
            .order_by(Service.name)
            .all()
        )

    def get_all_services(self) -> List[Service]:
        return self.db.query(Service).order_by(Service.name).all()

    def get_services_by_business_category(self, business_id: UUID) -> List[Service]:
        business = self.db.query(Business).filter(Business.uuid == business_id).first()
        if not business or not business.category_id:
            return self.db.query(Service).order_by(Service.name).all()
        return (
            self.db.query(Service)
            .filter(Service.category_id == business.category_id)
            .order_by(Service.name)
            .all()
        )
