from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.address_controller import AddressController
from app.schemas.address import AddressCreate
from app.models.address import EntityType

address_router = APIRouter()


@address_router.post("/{entity_type}/{entity_id}")
async def create_address(entity_type: EntityType, entity_id: UUID, address: AddressCreate, db: Session = Depends(get_db)):
    controller = AddressController(db)
    return controller.create_entity_address(entity_type, entity_id, address)


@address_router.get("/{entity_type}/{entity_id}")
async def get_addresses(entity_type: EntityType, entity_id: UUID, db: Session = Depends(get_db)):
    controller = AddressController(db)
    return controller.get_entity_addresses(entity_type, entity_id)
