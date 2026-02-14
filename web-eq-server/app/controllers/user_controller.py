from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

from app.services.user_service import UserService
from app.models.user import User
from app.schemas.user import (
    UserData,
    UsersAppointmentsResponse,
    AppointmentUserItem,
    UserDetailResponse,
    UserDetailUserInfo,
    QueueSummaryItem,
)


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

    def get_users_appointments(
        self,
        business_id: Optional[UUID] = None,
        queue_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
    ) -> UsersAppointmentsResponse:
        if business_id is not None and queue_id is not None:
            raise HTTPException(
                status_code=400,
                detail={"message": "Provide either business_id or queue_id, not both"},
            )
        if business_id is None and queue_id is None:
            raise HTTPException(
                status_code=400,
                detail={"message": "At least one of business_id or queue_id must be provided"},
            )
        try:
            items, total = self.service.get_users_with_appointments(
                business_id=business_id,
                queue_id=queue_id,
                page=page,
                limit=limit,
            )
            return UsersAppointmentsResponse(items=items, total=total, page=page, limit=limit)
        except SQLAlchemyError as e:
            raise HTTPException(status_code=500, detail={"message": f"Database error: {str(e)}"})

    def get_user_detail(self, user_id: UUID) -> UserDetailResponse:
        result = self.service.get_user_detail(user_id)
        if not result:
            raise HTTPException(status_code=404, detail={"message": "User not found"})
        user, queue_rows = result

        phone_number = (user.phone_number or "").strip()
        if user.country_code and phone_number:
            phone_display = f"{user.country_code} {phone_number}"
        else:
            phone_display = phone_number

        user_info = UserDetailUserInfo(
            user_id=str(user.uuid),
            full_name=user.full_name,
            email=user.email,
            country_code=user.country_code,
            phone_number=phone_display,
            profile_picture=user.profile_picture,
            date_of_birth=user.date_of_birth,
            gender=user.gender,
            member_since=user.created_at,
        )
        queue_summary = [
            QueueSummaryItem(
                queue_id=str(row.queue_id),
                queue_name=row.queue_name or "",
                total_appointments=row.total_appointments or 0,
                last_visit=row.last_visit,
            )
            for row in queue_rows
        ]
        return UserDetailResponse(user_info=user_info, queue_summary=queue_summary)
