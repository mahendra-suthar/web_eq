from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.controllers.address_controller import AddressController
from app.middleware.permissions import get_current_user
from app.models.address import EntityType
from app.models.user import User
from app.schemas.address import AddressCreate

address_router = APIRouter()


@address_router.post("/{entity_type}/{entity_id}")
async def create_address(entity_type: EntityType, entity_id: UUID, address: AddressCreate, db: Session = Depends(get_db)):
    controller = AddressController(db)
    return controller.create_entity_address(entity_type, entity_id, address)


@address_router.put("/{entity_type}/{entity_id}")
async def upsert_address(
    entity_type: EntityType,
    entity_id: UUID,
    address: AddressCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = AddressController(db)
    return controller.upsert_entity_address(entity_type, entity_id, address, user)


@address_router.get("/{entity_type}/{entity_id}")
async def get_addresses(entity_type: EntityType, entity_id: UUID, db: Session = Depends(get_db)):
    controller = AddressController(db)
    return controller.get_entity_addresses(entity_type, entity_id)
