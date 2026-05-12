import uuid
import logging
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.role import Role, UserRoles

logger = logging.getLogger(__name__)


class RoleService:
    def __init__(self, db: Session):
        self.db = db

    def get_role_by_name(self, name: str) -> Optional[Role]:
        return self.db.query(Role).filter(Role.name == name).first()

    def create_role(self, name: str, description: Optional[str] = None) -> Role:
        role = Role(
            uuid=uuid.uuid4(),
            name=name,
            description=description or f"This is {name} role"
        )
        self.db.add(role)
        self.db.commit()
        self.db.refresh(role)
        return role

    def get_user_role(self, user_id: uuid.UUID, role_id: uuid.UUID) -> Optional[UserRoles]:
        return (
            self.db.query(UserRoles)
            .filter(UserRoles.user_id == user_id)
            .filter(UserRoles.role_id == role_id)
            .first()
        )

    def create_user_role(self, user_id: uuid.UUID, role_id: uuid.UUID) -> UserRoles:
        user_role = UserRoles(
            uuid=uuid.uuid4(),
            user_id=user_id,
            role_id=role_id
        )
        try:
            self.db.add(user_role)
            self.db.commit()
            self.db.refresh(user_role)
            return user_role
        except IntegrityError:
            # Race condition: role already assigned between our check and insert — idempotent
            self.db.rollback()
            logger.warning("Race condition in create_user_role user_id=%s role_id=%s — returning existing", user_id, role_id)
            return self.db.query(UserRoles).filter_by(user_id=user_id, role_id=role_id).first()  # type: ignore[return-value]

    def get_user_roles(self, user_id: uuid.UUID) -> list[UserRoles]:
        return (
            self.db.query(UserRoles)
            .filter(UserRoles.user_id == user_id)
            .all()
        )
