from sqlalchemy.orm import Session, joinedload, contains_eager
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import func, case, and_, true
from uuid import UUID
from typing import Optional, List, Tuple, Dict
from collections import defaultdict

from app.models.business import Business
from app.models.queue import QueueService as QueueServiceModel
from app.models.service import Service
from app.models.address import Address, EntityType
from app.models.schedule import Schedule, ScheduleEntityType
from app.models.review import Review
from app.core.constants import BUSINESS_DRAFT, BUSINESS_REGISTERED, BUSINESS_ACTIVE
from app.schemas.business import BusinessBasicInfoInput, BusinessBasicInfoUpdate


class BusinessService:
    def __init__(self, db: Session):
        self.db = db

    def get_business_by_owner(self, owner_id: UUID) -> Optional[Business]:
        return self.db.query(Business).filter(Business.owner_id == owner_id).first()

    def create_business_basic_info(self, data: BusinessBasicInfoInput) -> Business:
        new_business = Business(
            name=data.name,
            email=data.email,
            about_business=data.about_business,
            category_id=data.category_id,
            profile_picture=data.profile_picture,
            owner_id=data.owner_id,
            phone_number=data.phone_number,
            country_code=data.country_code,
            status=BUSINESS_DRAFT,
            current_step=1  # type: ignore[assignment] # Step 1: Basic Info
        )

        try:
            self.db.add(new_business)
            self.db.commit()
            self.db.refresh(new_business)
            return new_business
        except Exception:
            self.db.rollback()
            raise

    def update_business_basic_info(self, business: Business, data: BusinessBasicInfoInput) -> Business:
        business.name = data.name  # type: ignore[assignment]
        business.email = data.email  # type: ignore[assignment]
        business.about_business = data.about_business  # type: ignore[assignment]
        business.category_id = data.category_id  # type: ignore[assignment]
        if data.profile_picture:
            business.profile_picture = data.profile_picture  # type: ignore[assignment]
        business.current_step = 1  # type: ignore[assignment] # Step 1: Basic Info

        try:
            self.db.commit()
            self.db.refresh(business)
            return business
        except Exception:
            self.db.rollback()
            raise

    def update_business_basic_info_partial(self, business: Business, data: BusinessBasicInfoUpdate) -> Business:
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(business, field):
                setattr(business, field, value)
        try:
            self.db.commit()
            self.db.refresh(business)
            return business
        except Exception:
            self.db.rollback()
            raise

    def update_registration_state(
        self, business_id: UUID, *, current_step: Optional[int] = None, status: Optional[int] = None, 
        is_always_open: Optional[bool] = None
    ) -> None:
        updates: dict = {}
        if current_step is not None: updates["current_step"] = current_step
        if status is not None: updates["status"] = status
        if is_always_open is not None: updates["is_always_open"] = is_always_open
        if not updates: return
        self.db.query(Business).filter(Business.uuid == business_id).update(updates)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def get_businesses_with_filters(self, category_id: Optional[UUID] = None, service_ids: Optional[List[UUID]] = None) -> List[Business]:
        query = self.db.query(Business).options(joinedload(Business.category)).distinct()
        
        if category_id:
            query = query.filter(Business.category_id == category_id)
        
        if service_ids:
            query = (
                query.join(QueueServiceModel, Business.uuid == QueueServiceModel.business_id)
                .filter(QueueServiceModel.service_id.in_(service_ids))
            )

        return query.all()

    def get_businesses_with_services_and_addresses(
        self, 
        category_id: Optional[UUID] = None, 
        service_ids: Optional[List[UUID]] = None
    ) -> List[Tuple[Business, Optional[QueueServiceModel], Optional[Service], Optional[Address]]]:
        query = (
            self.db.query(Business, QueueServiceModel, Service, Address)
            .outerjoin(QueueServiceModel, Business.uuid == QueueServiceModel.business_id)
            .outerjoin(Service, QueueServiceModel.service_id == Service.uuid)
            .outerjoin(
                Address,
                and_(
                    Address.entity_id == Business.uuid,
                    Address.entity_type == EntityType.BUSINESS
                )
            )
            .options(joinedload(Business.category))
        )
        
        if category_id:
            query = query.filter(Business.category_id == category_id)
        
        if service_ids:
            query = query.filter(QueueServiceModel.service_id.in_(service_ids))
        
        return query.distinct().all()

    def get_schedules_by_businesses(self, business_ids: List[UUID], day_of_week: int) -> Dict[UUID, Optional[Schedule]]:
        """Get today's schedule for multiple businesses in a single query"""
        if not business_ids:
            return {}

        schedules = (
            self.db.query(Schedule)
            .filter(
                Schedule.entity_type == ScheduleEntityType.BUSINESS,
                Schedule.entity_id.in_(business_ids),
                Schedule.day_of_week == day_of_week
            )
            .all()
        )

        schedule_map: Dict[UUID, Optional[Schedule]] = {bid: None for bid in business_ids}
        for schedule in schedules:
            schedule_map[schedule.entity_id] = schedule

        return schedule_map

    def get_review_stats_by_businesses(self, business_ids: List[UUID]) -> Dict[UUID, Tuple[float, int]]:
        """Get (avg_rating, review_count) for multiple businesses in a single query"""
        if not business_ids:
            return {}

        results = (
            self.db.query(
                Review.business_id,
                func.coalesce(func.avg(Review.rating), 0.0),
                func.count(Review.uuid)
            )
            .filter(Review.business_id.in_(business_ids))
            .group_by(Review.business_id)
            .all()
        )

        stats: Dict[UUID, Tuple[float, int]] = {}
        for business_id, avg_rating, count in results:
            stats[business_id] = (round(float(avg_rating), 1), int(count))

        return stats

    def get_business_with_category(self, business_id: UUID) -> Optional[Business]:
        return self.db.query(Business).options(joinedload(Business.category)).filter(Business.uuid == business_id).first()


