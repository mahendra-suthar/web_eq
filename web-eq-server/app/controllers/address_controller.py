from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from app.models.address import EntityType
from app.schemas.address import AddressCreate
from app.services.address_service import AddressService
from app.services.business_service import BusinessService


class AddressController:
    def __init__(self, db: Session):
        self.db = db
        self.address_service = AddressService(db)
        self.business_service = BusinessService(db)

    def create_entity_address(self, entity_type: EntityType, entity_id: UUID, address: AddressCreate):
        try:
            created_address = self.address_service.create_address(address.dict(exclude_unset=True), entity_type, entity_id)
            if entity_type == EntityType.BUSINESS:
                self.business_service.update_registration_state(business_id=entity_id, current_step=3)
            return created_address
        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create address: {str(e)}")

    def get_entity_addresses(self, entity_type: EntityType, entity_id: UUID):
        try:
            return self.address_service.get_addresses_by_entity(entity_type, entity_id)
        except HTTPException:
            raise
        except SQLAlchemyError: 
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to fetch addresses: {str(e)}")