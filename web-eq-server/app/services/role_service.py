import uuid
from typing import Optional
from sqlalchemy.orm import Session

from app.models.role import Role, UserRoles


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
        self.db.add(user_role)
        self.db.commit()
        self.db.refresh(user_role)
        return user_role

    def get_user_roles(self, user_id: uuid.UUID) -> list[UserRoles]:
        return (
            self.db.query(UserRoles)
            .filter(UserRoles.user_id == user_id)
            .all()
        )
