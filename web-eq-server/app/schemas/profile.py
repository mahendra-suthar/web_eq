from pydantic import BaseModel
from typing import Optional, List
from app.schemas.schedule import ScheduleData

class OwnerInfo(BaseModel):
    uuid: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: str
    country_code: str
    profile_picture: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[int] = None

    @classmethod
    def from_user(cls, user) -> "OwnerInfo":
        return cls(
            uuid=str(user.uuid),  # type: ignore
            full_name=str(user.full_name) if user.full_name else None,  # type: ignore
            email=str(user.email) if user.email else None,  # type: ignore
            phone_number=str(user.phone_number),  # type: ignore
            country_code=str(user.country_code),  # type: ignore
            profile_picture=str(user.profile_picture) if user.profile_picture else None,  # type: ignore
            date_of_birth=user.date_of_birth.isoformat() if user.date_of_birth else None,  # type: ignore
            gender=int(user.gender) if user.gender is not None else None  # type: ignore
        )


class BusinessInfo(BaseModel):
    uuid: str
    name: str
    email: Optional[str] = None
    phone_number: str
    country_code: str
    about_business: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    profile_picture: Optional[str] = None
    is_always_open: bool
    current_step: Optional[int] = None
    status: Optional[int] = None

    @classmethod
    def from_business(cls, business) -> "BusinessInfo":
        return cls(
            uuid=str(business.uuid),  # type: ignore
            name=str(business.name),  # type: ignore
            email=str(business.email) if getattr(business, 'email', None) else None,  # type: ignore
            phone_number=str(business.phone_number),  # type: ignore
            country_code=str(business.country_code),  # type: ignore
            about_business=str(business.about_business) if getattr(business, 'about_business', None) else None,  # type: ignore
            category_id=str(business.category_id) if getattr(business, 'category_id', None) else None,  # type: ignore
            category_name=str(business.category.name) if business.category and getattr(business.category, 'name', None) else None,  # type: ignore
            profile_picture=str(business.profile_picture) if getattr(business, 'profile_picture', None) else None,  # type: ignore
            is_always_open=bool(business.is_always_open),  # type: ignore
            current_step=int(business.current_step) if getattr(business, 'current_step', None) is not None else None,  # type: ignore
            status=int(business.status) if getattr(business, 'status', None) is not None else None  # type: ignore
        )


class EmployeeInfo(BaseModel):
    uuid: str
    business_id: str
    full_name: str
    email: Optional[str] = None
    phone_number: Optional[str] = None
    country_code: Optional[str] = None
    profile_picture: Optional[str] = None
    is_verified: bool

    @classmethod
    def from_employee(cls, employee) -> "EmployeeInfo":
        return cls(
            uuid=str(employee.uuid),  # type: ignore
            business_id=str(employee.business_id),  # type: ignore
            full_name=str(employee.full_name),  # type: ignore
            email=str(employee.email) if employee.email else None,  # type: ignore
            phone_number=str(employee.phone_number) if employee.phone_number else None,  # type: ignore
            country_code=str(employee.country_code) if employee.country_code else None,  # type: ignore
            profile_picture=str(employee.profile_picture) if employee.profile_picture else None,  # type: ignore
            is_verified=bool(employee.is_verified)  # type: ignore
        )


class ScheduleInfo(BaseModel):
    is_always_open: bool
    schedules: List[ScheduleData]


class AddressData(BaseModel):
    unit_number: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    street_1: str
    street_2: Optional[str] = None
    city: str
    district: Optional[str] = None
    state: str
    postal_code: str
    country: Optional[str] = "INDIA"
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @classmethod
    def from_address(cls, address) -> "AddressData":
        return cls(
            unit_number=str(address.unit_number) if address.unit_number else None,  # type: ignore
            building=str(address.building) if address.building else None,  # type: ignore
            floor=str(address.floor) if address.floor else None,  # type: ignore
            street_1=str(address.street_1),  # type: ignore
            street_2=str(address.street_2) if address.street_2 else None,  # type: ignore
            city=str(address.city),  # type: ignore
            district=str(address.district) if address.district else None,  # type: ignore
            state=str(address.state),  # type: ignore
            postal_code=str(address.postal_code),  # type: ignore
            country=str(address.country) if address.country else None,  # type: ignore
            latitude=float(address.latitude) if address.latitude is not None else None,  # type: ignore
            longitude=float(address.longitude) if address.longitude is not None else None  # type: ignore
        )


class UnifiedProfileResponse(BaseModel):
    profile_type: str  # "BUSINESS", "EMPLOYEE", "CUSTOMER"
    user: OwnerInfo
    business: Optional[BusinessInfo] = None
    employee: Optional[EmployeeInfo] = None
    address: Optional[AddressData] = None
    schedule: Optional[ScheduleInfo] = None
