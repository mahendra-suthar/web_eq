"""
Customer-facing controller: profile, appointments (list + detail).
Request/response only; business logic in services.
"""
from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException

from app.models.user import User
from app.models.address import EntityType
from app.services.user_service import UserService
from app.services.address_service import AddressService
from app.services.queue_service import QueueService
from app.services.booking_calculation_service import BookingCalculationService
from app.schemas.profile import CustomerProfileResponse, OwnerInfo, AddressData
from app.schemas.customer import (
    CustomerProfileUpdateInput,
    CustomerAppointmentListItem,
    CustomerAppointmentListResponse,
    CustomerAppointmentDetailResponse,
)
from app.schemas.auth import UserRegistrationInput
from app.core.constants import QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS


class CustomerController:
    def __init__(self, db: Session):
        self.db = db
        self.user_service = UserService(db)
        self.address_service = AddressService(db)
        self.queue_service = QueueService(db)

    def get_profile(self, user: User) -> CustomerProfileResponse:
        user_info = OwnerInfo.from_user(user)
        addresses = self.address_service.get_addresses_by_entity(EntityType.USER, user.uuid)
        address = AddressData.from_address(addresses[0]) if addresses else None
        return CustomerProfileResponse(user=user_info, address=address)

    def update_profile(self, user: User, data: CustomerProfileUpdateInput) -> CustomerProfileResponse:
        payload = data.model_dump(exclude_unset=True)
        if not payload:
            return self.get_profile(user)
        dob = payload.get("date_of_birth")
        if dob is None and getattr(user, "date_of_birth", None):
            dob = user.date_of_birth.strftime("%Y-%m-%d") if hasattr(user.date_of_birth, "strftime") else str(user.date_of_birth)
        input_data = UserRegistrationInput(
            country_code=user.country_code or "",
            phone_number=user.phone_number or "",
            full_name=payload.get("full_name", user.full_name),
            email=payload.get("email", user.email),
            date_of_birth=dob,
            gender=payload.get("gender") if "gender" in payload else user.gender,
        )
        updated = self.user_service.update_user_profile(user, input_data)
        return self.get_profile(updated)

    def get_appointments(
        self, user_id: UUID, limit: int = 50, offset: int = 0
    ) -> CustomerAppointmentListResponse:
        total = self.queue_service.count_appointments_for_user(user_id)
        rows = self.queue_service.get_appointments_for_user(user_id, limit=limit, offset=offset)
        result = []
        calc = None
        for qu, queue, business in rows:
            service_names = []
            for qus in getattr(qu, "queue_user_services", []) or []:
                qs = getattr(qus, "queue_service", None)
                if qs and getattr(qs, "service", None):
                    service_names.append(qs.service.name)
            service_summary = " · ".join(service_names) if service_names else None
            metrics = None
            if qu.status in (QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS):
                if calc is None:
                    calc = BookingCalculationService(self.db)
                metrics = calc.get_existing_queue_user_metrics(qu)
            result.append(
                CustomerAppointmentListItem.from_orm_row(qu, queue, business, service_summary, metrics)
            )
        has_more = offset + len(result) < total
        return CustomerAppointmentListResponse(items=result, total=total, has_more=has_more)

    def get_appointment_by_id(
        self, user_id: UUID, queue_user_id: UUID
    ) -> CustomerAppointmentDetailResponse:
        qu = self.queue_service.get_appointment_by_id_for_user(user_id, queue_user_id)
        if not qu:
            raise HTTPException(status_code=404, detail="Appointment not found")
        queue = qu.queue
        business = getattr(queue, "business", None)
        service_names = []
        for qus in getattr(qu, "queue_user_services", []) or []:
            qs = getattr(qus, "queue_service", None)
            if qs and getattr(qs, "service", None):
                service_names.append(qs.service.name)
        service_summary = " · ".join(service_names) if service_names else None
        metrics = None
        if qu.status in (QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS):
            calc = BookingCalculationService(self.db)
            metrics = calc.get_existing_queue_user_metrics(qu)
        return CustomerAppointmentDetailResponse.from_queue_user_and_metrics(
            qu, queue, business, service_summary, metrics
        )
