from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

from app.services.user_service import UserService
from app.models.user import User
from app.schemas.user import UserData

class UserController:
    
    def __init__(self, db: Session):
        self.service = UserService(db)
    
    def get_user_by_id(self, user_id: UUID) -> Optional[User]:
        return self.service.get_user_by_id(user_id)

    async def get_users(
        self, page: int, limit: int, search: str | None
    ) -> list[UserData]:
        try:
            users = self.service.get_users(page, limit, search)
            return [UserData.from_user(user) for user in users]
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get users: {str(e)}")
