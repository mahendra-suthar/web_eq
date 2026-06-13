import logging
from datetime import date
from io import BytesIO
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Literal, Optional
from fastapi import HTTPException

from app.services.user_service import UserService
from app.services.export_service import MAX_EXPORT_ROWS, build_xlsx, build_pdf
from app.models.user import User
from app.schemas.user import (
    UserData,
    UsersAppointmentsResponse,
    AppointmentUserItem,
    UserDetailResponse,
    UserDetailUserInfo,
    QueueSummaryItem,
)

logger = logging.getLogger(__name__)


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
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_users")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_users_appointments(
        self,
        business_id: Optional[UUID] = None,
        queue_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
        search: Optional[str] = None,
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
                search=search or None,
            )
            return UsersAppointmentsResponse(items=items, total=total, page=page, limit=limit)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_users_appointments (business_id=%s queue_id=%s)", business_id, queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def export_users_appointments(
        self,
        fmt: Literal["pdf", "xlsx"],
        business_id: Optional[UUID] = None,
        queue_id: Optional[UUID] = None,
    ) -> tuple[BytesIO, str, str]:
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
            items, _ = self.service.get_users_with_appointments(
                business_id=business_id,
                queue_id=queue_id,
                page=1,
                limit=MAX_EXPORT_ROWS,
            )
            columns = ["Name", "Email", "Phone", "Total Appointments", "Last Visit"]
            rows = [
                [
                    item.full_name or "",
                    item.email or "",
                    item.phone_number or "",
                    item.total_appointments,
                    item.last_visit_date.strftime("%Y-%m-%d") if item.last_visit_date else "",
                ]
                for item in items
            ]
            today = date.today().strftime("%Y-%m-%d")
            filename = f"users-{today}.{fmt}"
            if fmt == "xlsx":
                buf = build_xlsx(columns, rows)
                media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            else:
                buf = build_pdf("Users Report", columns, rows)
                media_type = "application/pdf"
            return buf, media_type, filename
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to export_users_appointments (business_id=%s queue_id=%s)", business_id, queue_id)
            raise HTTPException(status_code=500, detail={"message": "Export failed. Please try again."})

    def get_user_detail(self, user_id: UUID) -> UserDetailResponse:
        try:
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
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_user_detail (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
