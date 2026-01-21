from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from typing import Optional

from app.models.business import Business
from app.core.constants import BUSINESS_DRAFT, BUSINESS_REGISTERED
from app.schemas.business import BusinessBasicInfoInput


class BusinessService:
    def __init__(self, db: Session):
        self.db = db

    def get_business_by_owner(self, owner_id: UUID) -> Optional[Business]:
        return self.db.query(Business).filter(Business.owner_id == owner_id).first()

    def get_business_by_id(self, business_id: UUID) -> Optional[Business]:
        return self.db.query(Business).filter(Business.uuid == business_id).first()

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


