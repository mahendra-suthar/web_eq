from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID


class EmployeeCreate(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture: Optional[str] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture: Optional[str] = None


class BusinessEmployeesInput(BaseModel):
    business_id: UUID
    employees: list[EmployeeCreate]


class EmployeeData(BaseModel):
    uuid: str
    business_id: str
    full_name: str
    email: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: Optional[str] = None
    profile_picture: Optional[str] = None
    is_verified: bool

    @classmethod
    def from_employee(cls, employee) -> "EmployeeData":
        return cls(
            uuid=str(employee.uuid),
            business_id=str(employee.business_id),
            full_name=employee.full_name,
            email=employee.email,
            country_code=getattr(employee, "country_code", None),
            phone_number=getattr(employee, "phone_number", None),
            profile_picture=employee.profile_picture,
            is_verified=employee.is_verified,
        )

    class Config:
        from_attributes = True
