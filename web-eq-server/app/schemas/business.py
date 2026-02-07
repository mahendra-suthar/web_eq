from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
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


class BusinessFilterInput(BaseModel):
    category_id: Optional[UUID] = None
    service_ids: Optional[List[UUID]] = None


class BusinessListItem(BaseModel):
    uuid: str
    name: str
    about_business: Optional[str] = None
    profile_picture: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    service_names: Optional[List[str]] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_open: bool = False
    is_always_open: bool = False
    opens_at: Optional[str] = None  # e.g. "09:00 AM"
    closes_at: Optional[str] = None  # e.g. "06:00 PM"
    rating: float = 0.0
    review_count: int = 0

    @classmethod
    def from_business(
        cls,
        business,
        services_data=None,
        address=None,
        is_open: bool = False,
        is_always_open: bool = False,
        opens_at: Optional[str] = None,
        closes_at: Optional[str] = None,
        rating: float = 0.0,
        review_count: int = 0,
    ) -> "BusinessListItem":
        category_name = None
        if business.category:
            category_name = str(business.category.name)
        
        service_names = None
        min_price = None
        max_price = None
        if services_data:
            # services_data is List[Tuple[QueueServiceModel, Service]]
            service_names = [service.name for _, service in services_data if service and service.name]
            prices = [
                queue_service.service_fee 
                for queue_service, _ in services_data 
                if queue_service and queue_service.service_fee is not None
            ]
            if prices:
                min_price = float(min(prices))
                max_price = float(max(prices))
        
        address_str = None
        latitude = None
        longitude = None
        if address:
            address_parts = []
            if address.street_1:
                address_parts.append(address.street_1)
            if address.street_2:
                address_parts.append(address.street_2)
            if address.city:
                address_parts.append(address.city)
            if address.district:
                address_parts.append(address.district)
            if address.state:
                address_parts.append(address.state)
            address_str = ", ".join(address_parts) if address_parts else None
            latitude = address.latitude
            longitude = address.longitude
        
        return cls(
            uuid=str(business.uuid),
            name=business.name,
            about_business=business.about_business,
            profile_picture=business.profile_picture,
            category_id=str(business.category_id) if business.category_id else None,
            category_name=category_name,
            service_names=service_names,
            min_price=min_price,
            max_price=max_price,
            address=address_str,
            latitude=latitude,
            longitude=longitude,
            is_open=is_open,
            is_always_open=is_always_open,
            opens_at=opens_at,
            closes_at=closes_at,
            rating=rating,
            review_count=review_count,
        )


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


class AddressData(BaseModel):
    unit_number: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    street_1: Optional[str] = None
    street_2: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @classmethod
    def from_address(cls, address) -> Optional["AddressData"]:
        if not address:
            return None
        return cls(
            unit_number=address.unit_number,
            building=address.building,
            floor=address.floor,
            street_1=address.street_1,
            street_2=address.street_2,
            city=address.city,
            district=address.district,
            state=address.state,
            postal_code=address.postal_code,
            country=address.country,
            latitude=address.latitude,
            longitude=address.longitude,
        )


class BusinessDetailData(BaseModel):
    uuid: str
    name: str
    about_business: Optional[str] = None
    profile_picture: Optional[str] = None
    phone_number: Optional[str] = None
    country_code: Optional[str] = None
    email: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    address: Optional[AddressData] = None
    is_open: bool = True

    @classmethod
    def from_business(cls, business, address=None) -> "BusinessDetailData":
        category_name = None
        if business.category:
            category_name = str(business.category.name)
        
        return cls(
            uuid=str(business.uuid),
            name=business.name,
            about_business=business.about_business,
            profile_picture=business.profile_picture,
            phone_number=business.phone_number,
            country_code=business.country_code,
            email=business.email,
            category_id=str(business.category_id) if business.category_id else None,
            category_name=category_name,
            address=AddressData.from_address(address) if address else None,
            is_open=True,
        )


class BusinessServiceData(BaseModel):
    uuid: str
    service_uuid: str
    name: str
    description: Optional[str] = None
    image: Optional[str] = None
    price: Optional[float] = None
    duration: Optional[int] = None

    @classmethod
    def from_queue_service_and_service(cls, queue_service, service) -> "BusinessServiceData":
        description = queue_service.description if queue_service.description else service.description
        
        return cls(
            uuid=str(queue_service.uuid),
            service_uuid=str(service.uuid),
            name=service.name,
            description=description,
            image=service.image,
            price=queue_service.service_fee,
            duration=queue_service.avg_service_time,
        )
