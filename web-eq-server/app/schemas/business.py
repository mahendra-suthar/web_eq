from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID


class BusinessBasicInfoInput(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    about_business: Optional[str] = None
    category_id: UUID
    profile_picture: Optional[str] = None  # URL string
    owner_id: UUID
    phone_number: str
    country_code: str

    @field_validator("email")
    @classmethod
    def email_must_be_lowercase(cls, value: Optional[str]) -> Optional[str]:
        if value:
            return value.lower()
        return value

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Business name cannot be empty")
        if len(value.strip()) > 100:
            raise ValueError("Business name must be less than 100 characters")
        return value.strip()


class BusinessData(BaseModel):
    uuid: str
    name: str
    email: Optional[str] = None
    about_business: Optional[str] = None
    category_id: str
    owner_id: str
    profile_picture: Optional[str] = None
    phone_number: str
    country_code: str

    @classmethod
    def from_business(cls, business) -> "BusinessData":
        return cls(
            uuid=str(business.uuid),
            name=business.name,
            email=business.email,
            about_business=business.about_business,
            category_id=str(business.category_id) if business.category_id else "",
            owner_id=str(business.owner_id),
            profile_picture=business.profile_picture,
            phone_number=business.phone_number,
            country_code=business.country_code
        )

    class Config:
        from_attributes = True


class BusinessBasicInfoUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    about_business: Optional[str] = None
    category_id: Optional[UUID] = None
    phone_number: Optional[str] = None
    country_code: Optional[str] = None
    profile_picture: Optional[str] = None

    @field_validator("email")
    @classmethod
    def email_must_be_lowercase(cls, value: Optional[str]) -> Optional[str]:
        if value:
            return value.lower()
        return value

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            if not value.strip():
                raise ValueError("Business name cannot be empty")
            if len(value.strip()) > 100:
                raise ValueError("Business name must be less than 100 characters")
            return value.strip()
        return value
