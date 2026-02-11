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

