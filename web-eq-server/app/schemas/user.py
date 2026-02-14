from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
from uuid import UUID

from app.models.user import User


class Token(BaseModel):
    access_token: str
    token_type: str = "Bearer"


class UserData(BaseModel):
    uuid: str
    country_code: str
    phone_number: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[int] = None

    @field_validator('uuid', mode='before')
    @classmethod
    def convert_uuid_to_string(cls, value: str | UUID) -> str:
        if isinstance(value, UUID):
            return str(value)
        return str(value) if value is not None else ""

    @classmethod
    def from_user(cls, user: User) -> "UserData":
        return cls.model_validate(user)

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    token: Optional[Token] = None
    user: Optional[UserData] = None
    next_step: Optional[str] = None  # e.g. "dashboard", "invitation_code", "owner_info", "business_registration"
    profile_type: Optional[str] = None  # "CUSTOMER", "BUSINESS", "EMPLOYEE"


class AppointmentUserItem(BaseModel):
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: str  # display string (may include country_code)
    total_appointments: int
    last_visit_date: Optional[datetime] = None

    @field_validator("user_id", mode="before")
    @classmethod
    def user_id_to_str(cls, v):
        return str(v) if v is not None else ""

    class Config:
        from_attributes = True


class UsersAppointmentsResponse(BaseModel):
    items: list[AppointmentUserItem]
    total: int
    page: int
    limit: int


# ─── User Detail (GET /users/{user_id}) ─────────────────────────────────────

class UserDetailUserInfo(BaseModel):
    user_id: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: str  # display string (may include country_code)
    profile_picture: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[int] = None
    member_since: Optional[datetime] = None

    @field_validator("user_id", mode="before")
    @classmethod
    def user_id_to_str(cls, v):
        return str(v) if v is not None else ""

    class Config:
        from_attributes = True


class QueueSummaryItem(BaseModel):
    """Queue-wise appointment summary for a user."""
    queue_id: str
    queue_name: str
    total_appointments: int
    last_visit: Optional[datetime] = None

    @field_validator("queue_id", mode="before")
    @classmethod
    def queue_id_to_str(cls, v):
        return str(v) if v is not None else ""

    class Config:
        from_attributes = True


class UserDetailResponse(BaseModel):
    user_info: UserDetailUserInfo
    queue_summary: list[QueueSummaryItem]

