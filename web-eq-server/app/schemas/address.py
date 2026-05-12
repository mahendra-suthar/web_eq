from pydantic import BaseModel
from typing import Optional


class AddressCreate(BaseModel):
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
    address_type: Optional[str] = "WORK"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    images: Optional[str] = None
