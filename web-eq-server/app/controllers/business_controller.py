from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

from app.services.business_service import BusinessService
from app.schemas.business import BusinessBasicInfoInput, BusinessData
from app.controllers.role_controller import RoleController
from app.controllers.user_controller import UserController


class BusinessController:
    def __init__(self, db: Session):
        self.db = db
        self.business_service = BusinessService(db)
        self.role_controller = RoleController(db)
        self.user_controller = UserController(db)

    async def create_business_basic_info(self, data: BusinessBasicInfoInput) -> BusinessData:
        try:
            existing_business = self.business_service.get_business_by_owner(data.owner_id)
            if existing_business:
                business = self.business_service.update_business_basic_info(existing_business, data)
                return BusinessData.from_business(business)

            business = self.business_service.create_business_basic_info(data)
            self.role_controller.assign_role_to_user(data.owner_id, "BUSINESS")  # type: ignore[arg-type]
            return BusinessData.from_business(business)

        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create business: {str(e)}")


