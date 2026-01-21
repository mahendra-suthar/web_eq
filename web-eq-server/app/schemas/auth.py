import re
from pydantic import BaseModel, field_validator
from enum import Enum
from typing import Optional, Literal


class OTPRequestErrorCode(int, Enum):
    INVALID_PHONE_FORMAT = 1
    RATE_LIMIT_EXCEEDED = 2
    PHONE_ALREADY_EXIST = 3
    PHONE_DOES_NOT_EXIST = 4


class OTPRequestInput(BaseModel):
    country_code: str
    phone_number: str
    user_type: Literal['customer', 'business'] = 'customer'

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, v: str) -> str:
        if not v or not v.startswith("+"):
            raise ValueError("Country code must start with +")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        if not v or len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        if not v.isdigit():
            raise ValueError("Phone number must contain only digits")
        if not v.startswith(('6', '7', '8', '9')):
            raise ValueError("Phone number must start with 6, 7, 8, or 9")
        return v


class OTPRequestResponse(BaseModel):
    message: str


class OTPVerifyErrorCode(int, Enum):
    OTP_NOT_FOUND = 1
    OTP_EXPIRED = 2
    OTP_INVALID = 3
    OTP_ALREADY_USED = 4


class OTPVerifyInput(BaseModel):
    country_code: str
    phone_number: str
    otp: str
    user_type: Literal['customer', 'business'] = 'customer'
    client_type: Optional[Literal['mobile', 'web']] = None

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, v: str) -> str:
        if not v or not v.startswith("+"):
            raise ValueError("Country code must start with +")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        if not v or len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        if not v.isdigit():
            raise ValueError("Phone number must contain only digits")
        if not v.startswith(('6', '7', '8', '9')):
            raise ValueError("Phone number must start with 6, 7, 8, or 9")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        if not v or len(v) != 5:
            raise ValueError("OTP must be 5 digits")
        if not v.isdigit():
            raise ValueError("OTP must contain only digits")
        return v




class UserRegistrationInput(BaseModel):
    country_code: str
    phone_number: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[int] = None
    user_type: Literal['customer', 'business'] = 'customer'
    client_type: Optional[Literal['mobile', 'web']] = None

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, v: str) -> str:
        if not v or not v.startswith("+"):
            raise ValueError("Country code must start with +")
        return v

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, v: str) -> str:
        if not v or len(v) != 10:
            raise ValueError("Phone number must be 10 digits")
        if not v.isdigit():
            raise ValueError("Phone number must contain only digits")
        if not v.startswith(('6', '7', '8', '9')):
            raise ValueError("Phone number must start with 6, 7, 8, or 9")
        return v

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if len(v) > 100:
            raise ValueError("Full name must be 100 characters or less")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v:
            email_regex = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
            if not re.match(email_regex, v):
                raise ValueError("Invalid email format")
            return v.lower()
        return v

    @field_validator("date_of_birth")
    @classmethod
    def validate_date_of_birth(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                from datetime import datetime
                birth_date = datetime.strptime(v, '%Y-%m-%d')
                if birth_date > datetime.now():
                    raise ValueError("Date of birth cannot be in the future")
                return v
            except ValueError as e:
                if "time data" in str(e):
                    raise ValueError("Invalid date format. Use YYYY-MM-DD")
                raise e
        return v

