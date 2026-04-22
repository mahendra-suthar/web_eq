import logging
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.address import EntityType
from app.models.user import User
from app.schemas.address import AddressCreate
from app.services.address_service import AddressService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService

logger = logging.getLogger(__name__)


class AddressController:
    def __init__(self, db: Session):
        self.db = db
        self.address_service = AddressService(db)
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)

    def create_entity_address(self, entity_type: EntityType, entity_id: UUID, address: AddressCreate):
        try:
            created_address = self.address_service.create_address(address.model_dump(exclude_unset=True), entity_type, entity_id)
            if entity_type == EntityType.BUSINESS:
                self.business_service.update_registration_state(business_id=entity_id, current_step=3)
            return created_address
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_entity_address (entity_type=%s entity_id=%s)", entity_type, entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_entity_addresses(self, entity_type: EntityType, entity_id: UUID):
        try:
            return self.address_service.get_addresses_by_entity(entity_type, entity_id)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_entity_addresses (entity_type=%s entity_id=%s)", entity_type, entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def can_edit_entity_address(self, user: User, entity_type: EntityType, entity_id: UUID) -> bool:
        if entity_type == EntityType.BUSINESS:
            business = self.business_service.get_business_by_owner(user.uuid)
            return business is not None and str(business.uuid) == str(entity_id)
        if entity_type == EntityType.EMPLOYEE:
            employee = self.employee_service.get_employee_by_user_id(user.uuid)
            return employee is not None and str(employee.uuid) == str(entity_id)
        return False

    def upsert_entity_address(self, entity_type: EntityType, entity_id: UUID, address: AddressCreate, user: User):
        try:
            if not self.can_edit_entity_address(user, entity_type, entity_id):
                raise HTTPException(status_code=403, detail="Not allowed to update this address")
            data = address.model_dump(exclude_unset=True)
            return self.address_service.upsert_address(data, entity_type, entity_id)
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to upsert_entity_address (entity_type=%s entity_id=%s)", entity_type, entity_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
