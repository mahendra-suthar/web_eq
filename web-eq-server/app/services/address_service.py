from uuid import UUID
from typing import List, Optional
from sqlalchemy.orm import Session

from app.models.address import Address, EntityType


class AddressService:
    def __init__(self, db: Session):
        self.db = db

    def create_address(self, address_data: dict, entity_type: EntityType, entity_id: UUID) -> Address:
        try:
            new_address = Address(**address_data, entity_type=entity_type, entity_id=entity_id)

            self.db.add(new_address)
            self.db.commit()
            self.db.refresh(new_address)

            return new_address
        except Exception as e:
            self.db.rollback()
            raise e

    def get_addresses_by_entity(self, entity_type: EntityType, entity_id: UUID) -> List[Address]:
        try:
            addresses = self.db.query(Address).filter(
                Address.entity_type == entity_type,
                Address.entity_id == entity_id
            ).all()

            return addresses
        except Exception as e:
            raise e

    def get_primary_address_by_entity(self, entity_type: EntityType, entity_id: UUID) -> Optional[Address]:
        try:
            address = self.db.query(Address).filter(
                Address.entity_type == entity_type,
                Address.entity_id == entity_id
            ).first()

            return address
        except Exception as e:
            raise e

    def upsert_address(self, address_data: dict, entity_type: EntityType, entity_id: UUID) -> Address:
        existing = self.get_primary_address_by_entity(entity_type, entity_id)
        payload = {k: v for k, v in address_data.items() if k not in ("entity_type", "entity_id")}
        if existing:
            for key, value in payload.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            try:
                self.db.commit()
                self.db.refresh(existing)
                return existing
            except Exception:
                self.db.rollback()
                raise
        return self.create_address(payload, entity_type, entity_id)

    def get_primary_addresses_by_entities(self, entity_type: EntityType, entity_ids: List[UUID]) -> dict[UUID, Optional[Address]]:
        try:
            if not entity_ids:
                return {}
            
            addresses = self.db.query(Address).filter(
                Address.entity_type == entity_type,
                Address.entity_id.in_(entity_ids)
            ).all()
            
            addresses_by_entity: dict[UUID, Optional[Address]] = {entity_id: None for entity_id in entity_ids}
            for address in addresses:
                addresses_by_entity[address.entity_id] = address
            
            return addresses_by_entity
        except Exception as e:
            raise e
