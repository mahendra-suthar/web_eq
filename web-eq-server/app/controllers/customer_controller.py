"""
Customer-facing controller: profile, appointments (list + detail + update).
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
from app.services.realtime.queue_manager import queue_manager
from app.schemas.profile import CustomerProfileResponse, OwnerInfo, AddressData
from app.schemas.customer import (
    CustomerProfileUpdateInput,
    AppointmentUpdateInput,
    CustomerAppointmentListItem,
    CustomerAppointmentListResponse,
    CustomerAppointmentDetailResponse,
    CustomerUpcomingAppointmentItem,
    CustomerUpcomingAppointmentsResponse,
)
from app.schemas.auth import UserRegistrationInput
from app.core.constants import QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS
from app.core.utils import today_app_date, format_date_iso


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
            qs_uuids = []
            for qus in getattr(qu, "queue_user_services", []) or []:
                qs = getattr(qus, "queue_service", None)
                if qs:
                    qs_uuids.append(str(qs.uuid))
                    if getattr(qs, "service", None):
                        service_names.append(qs.service.name)
            service_summary = " · ".join(service_names) if service_names else None
            metrics = None
            if qu.status in (QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS):
                if calc is None:
                    calc = BookingCalculationService(self.db)
                metrics = calc.get_existing_queue_user_metrics(qu)
            result.append(
                CustomerAppointmentListItem.from_orm_row(
                    qu, queue, business, service_summary, metrics,
                    queue_service_uuids=qs_uuids,
                )
            )
        has_more = offset + len(result) < total
        return CustomerAppointmentListResponse(items=result, total=total, has_more=has_more)

    def get_appointment_by_id(
        self, user_id: UUID, queue_user_id: UUID
    ) -> CustomerAppointmentDetailResponse:
        qu = self.queue_service.get_appointment_by_id_for_user(user_id, queue_user_id)
        if not qu:
            raise HTTPException(status_code=404, detail="Appointment not found")
        return self.build_appointment_detail(qu)

    async def update_appointment(
        self, user_id: UUID, queue_user_id: UUID, data: AppointmentUpdateInput
    ) -> CustomerAppointmentDetailResponse:
        payload = data.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No fields to update")

        qu = self.queue_service.get_queue_user_for_update(queue_user_id, user_id)
        if not qu:
            raise HTTPException(status_code=404, detail="Appointment not found")

        if qu.status != QUEUE_USER_REGISTERED:
            raise HTTPException(
                status_code=409,
                detail="Only waiting appointments can be updated",
            )

        queue = qu.queue
        business_id = queue.merchant_id
        today = today_app_date()

        old_queue_id = qu.queue_id
        old_date = qu.queue_date
        target_queue_id = data.queue_id or old_queue_id
        target_date = data.queue_date or old_date
        queue_changed = data.queue_id is not None and data.queue_id != old_queue_id
        date_changed = data.queue_date is not None and data.queue_date != old_date

        if date_changed and target_date < today:
            raise HTTPException(status_code=400, detail="Cannot reschedule to a past date")

        if queue_changed:
            new_queue = self.queue_service.get_queue_by_id_and_business(
                data.queue_id, business_id  # type: ignore[arg-type]
            )
            if not new_queue:
                raise HTTPException(
                    status_code=400,
                    detail="Target queue not found or belongs to a different business",
                )
            if new_queue.limit:
                active = self.queue_service.count_active_users_in_queue(
                    new_queue.uuid, target_date
                )
                if active >= new_queue.limit:
                    raise HTTPException(status_code=409, detail="Target queue is full")

        new_queue_services = None
        if data.service_ids is not None:
            if not data.service_ids:
                raise HTTPException(status_code=400, detail="At least one service required")
            new_queue_services = self.queue_service.get_queue_services_for_booking(
                data.service_ids, business_id
            )
            if not new_queue_services:
                raise HTTPException(status_code=400, detail="No valid services found")
            invalid = [qs for qs in new_queue_services if qs.queue_id != target_queue_id]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail="One or more services do not belong to the selected queue",
                )

        updated = self.queue_service.update_appointment(
            queue_user=qu,
            new_queue_id=data.queue_id,
            new_queue_services=new_queue_services,
            new_notes=data.notes if "notes" in payload else None,
            new_date=data.queue_date,
            queue_changed=queue_changed,
            date_changed=date_changed,
        )

        try:
            await queue_manager.connect_to_redis()
            str_user = str(user_id)
            str_business = str(business_id)

            if date_changed:
                if old_date == today:
                    await queue_manager.remove_from_queue(
                        db=self.db,
                        queue_id=str(old_queue_id),
                        user_id=str_user,
                        date_str=format_date_iso(old_date),
                        business_id=str_business,
                    )
                if target_date == today:
                    await queue_manager.add_to_queue(
                        db=self.db,
                        queue_id=str(target_queue_id),
                        user_id=str_user,
                        date_str=format_date_iso(target_date),
                        token_number=updated.token_number or "",
                        total_service_time=updated.turn_time or 0,
                        business_id=str_business,
                    )
            elif old_date == today or target_date == today:
                await queue_manager.update_queue_user(
                    db=self.db,
                    old_queue_id=str(old_queue_id),
                    new_queue_id=str(target_queue_id),
                    user_id=str_user,
                    date_str=format_date_iso(target_date),
                    new_total_service_time=updated.turn_time or 0,
                    token_number=updated.token_number or "",
                    business_id=str_business,
                    queue_changed=queue_changed,
                )
        except Exception:
            pass

        refreshed = self.queue_service.get_appointment_by_id_for_user(user_id, queue_user_id)
        if not refreshed:
            raise HTTPException(status_code=500, detail="Failed to reload appointment")
        return self.build_appointment_detail(refreshed)

    async def cancel_appointment(
        self, user_id: UUID, queue_user_id: UUID
    ) -> CustomerAppointmentDetailResponse:
        qu = self.queue_service.get_queue_user_for_update(queue_user_id, user_id)
        if not qu:
            raise HTTPException(status_code=404, detail="Appointment not found")

        if qu.status not in (QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS):
            raise HTTPException(
                status_code=409,
                detail="Only waiting or in-progress appointments can be cancelled",
            )

        queue = qu.queue
        business_id = queue.merchant_id
        queue_id = qu.queue_id

        self.queue_service.cancel_appointment(qu)

        slot_id = getattr(qu, "slot_id", None)
        if slot_id:
            try:
                self.queue_service.release_slot(slot_id)
            except Exception:
                pass

        if qu.queue_date == today_app_date():
            try:
                await queue_manager.connect_to_redis()
                await queue_manager.remove_from_queue(
                    db=self.db,
                    queue_id=str(queue_id),
                    user_id=str(user_id),
                    date_str=format_date_iso(qu.queue_date),
                    business_id=str(business_id),
                )
            except Exception:
                pass

        refreshed = self.queue_service.get_appointment_by_id_for_user(user_id, queue_user_id)
        if not refreshed:
            raise HTTPException(status_code=500, detail="Failed to reload appointment")
        return self.build_appointment_detail(refreshed)

    def get_upcoming_appointments(self, user_id: UUID) -> CustomerUpcomingAppointmentsResponse:
        rows = self.queue_service.get_user_upcoming_active_appointments(user_id)
        items = [
            CustomerUpcomingAppointmentItem.from_orm_row(qu, queue, business)
            for qu, queue, business in rows
        ]
        return CustomerUpcomingAppointmentsResponse(items=items)

    # ──────────────────────────────────────────────────────────────────────────

    def build_appointment_detail(self, qu) -> CustomerAppointmentDetailResponse:
        queue = qu.queue
        business = getattr(queue, "business", None)
        service_names = []
        qs_uuids = []
        for qus in getattr(qu, "queue_user_services", []) or []:
            qs = getattr(qus, "queue_service", None)
            if qs:
                qs_uuids.append(str(qs.uuid))
                if getattr(qs, "service", None):
                    service_names.append(qs.service.name)
        service_summary = " · ".join(service_names) if service_names else None
        metrics = None
        if qu.status in (QUEUE_USER_REGISTERED, QUEUE_USER_IN_PROGRESS):
            calc = BookingCalculationService(self.db)
            metrics = calc.get_existing_queue_user_metrics(qu)
        return CustomerAppointmentDetailResponse.from_queue_user_and_metrics(
            qu, queue, business, service_summary, metrics, queue_service_uuids=qs_uuids
        )
