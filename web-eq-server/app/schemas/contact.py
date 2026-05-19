from pydantic import BaseModel, EmailStr, field_validator


class ContactFormRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    country_code: str | None = "+91"
    message: str

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Full name must not exceed 100 characters")
        return v

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > 20:
            raise ValueError("Phone number must not exceed 20 characters")
        return v

    @field_validator("message")
    @classmethod
    def clean_message(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Message must be at least 10 characters")
        if len(v) > 2000:
            raise ValueError("Message must not exceed 2,000 characters")
        return v


class ContactFormResponse(BaseModel):
    message: str
