from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Response, Request

from app.core.utils import hash_otp, generate_otp, now_utc
from app.services.otp_service import OTPService
from app.services.auth_service import AuthService
from app.services.user_service import UserService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.services.address_service import AddressService
from app.services.schedule_service import ScheduleService
from app.controllers.role_controller import RoleController
from app.middleware.auth import detect_client_type
from app.core.config import RATE_LIMIT_PER_HOUR, OTP_EXPIRY_MINUTES
from app.core.constants import BUSINESS_REGISTERED
from app.models.user import User
from app.models.address import EntityType
from app.models.schedule import ScheduleEntityType
from app.schemas.auth import (
    OTPRequestInput, OTPRequestResponse, OTPRequestErrorCode, OTPVerifyInput,
    OTPVerifyErrorCode, UserRegistrationInput, VerifyInvitationInput
)
from app.schemas.user import LoginResponse, UserData
from app.schemas.profile import (
    UnifiedProfileResponse, CustomerProfileResponse, BusinessProfileResponse,
    OwnerInfo, BusinessInfo, EmployeeInfo, ScheduleInfo, AddressData, EmployeeDetailsResponse,
    QueueDetailInfo, QueueDetailServiceData,
)
from app.schemas.schedule import ScheduleData
from app.core.context import RequestContext



class AuthController:
    def __init__(self, db: Session):
        self.db = db
        self.otp_service = OTPService(db)
        self.auth_service = AuthService(db)
        self.user_service = UserService(db)
        self.role_controller = RoleController(db)
        self.business_service = BusinessService(db)
        self.employee_service = EmployeeService(db)
        self.address_service = AddressService(db)
        self.schedule_service = ScheduleService(db)

    def validate_otp_and_consume(self, country_code: str, phone_number: str, otp: str) -> None:
        otp_record = self.otp_service.get_latest_otp(country_code, phone_number)
        if not otp_record:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": OTPVerifyErrorCode.OTP_NOT_FOUND.value,
                    "message": "OTP not found",
                },
            )
        if int(otp_record.status) == 2:  # type: ignore[arg-type]
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": OTPVerifyErrorCode.OTP_ALREADY_USED.value,
                    "message": "OTP already used",
                },
            )
        expires_at = otp_record.expires_at
        if expires_at is not None:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < now_utc():
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error_code": OTPVerifyErrorCode.OTP_EXPIRED.value,
                        "message": "OTP expired",
                    },
                )
        if str(otp_record.otp_hash) != hash_otp(otp):  # type: ignore[arg-type]
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": OTPVerifyErrorCode.OTP_INVALID.value,
                    "message": "Invalid OTP",
                },
            )
        self.otp_service.mark_otp_used(otp_record)

    async def send_otp(self, data: OTPRequestInput) -> OTPRequestResponse:
        try:
            country_code = data.country_code
            phone_number = data.phone_number

            one_hour_ago = now_utc() - timedelta(hours=1)
            recent_attempts = self.otp_service.get_recent_otp_attempts(
                country_code, phone_number, one_hour_ago
            )
            if recent_attempts >= RATE_LIMIT_PER_HOUR:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error_code": OTPRequestErrorCode.RATE_LIMIT_EXCEEDED.value,
                        "message": "Rate limit exceeded. Please try again later.",
                    },
                )
            otp = generate_otp()
            hashed = hash_otp(otp)
            expires_at = now_utc() + timedelta(minutes=OTP_EXPIRY_MINUTES)
            self.otp_service.create_otp_entry(
                country_code=country_code,
                phone_number=phone_number,
                otp_hash=hashed,
                expires_at=expires_at,
                attempts=1,
                status=1
            )
            print(f"OTP for {country_code}{phone_number}: {otp}")
            return OTPRequestResponse(message="OTP sent successfully")
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception:
            raise

    async def verify_otp_customer(self, data: OTPVerifyInput, response: Response, request: Request) -> LoginResponse:
        try:
            self.validate_otp_and_consume(data.country_code, data.phone_number, data.otp)
            user = self.user_service.get_user_by_phone(data.country_code, data.phone_number)
            if not user:
                user = self.user_service.create_user(
                    UserRegistrationInput(
                        country_code=data.country_code,
                        phone_number=data.phone_number,
                        full_name=None,
                        email=None,
                        date_of_birth=None,
                        gender=None,
                        user_type="customer",
                        client_type=data.client_type,
                    )
                )
                self.role_controller.assign_role_to_user(user.uuid, "CUSTOMER")  # type: ignore[arg-type]
            client_type = detect_client_type(request, data.client_type)
            return await self.auth_service.generate_auth_response(
                user, response, client_type, user_type="CUSTOMER"
            )
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception:
            raise

    def get_or_create_user_for_business_flow(
        self, country_code: str, phone_number: str, client_type: Optional[str]
    ) -> User:
        user = self.user_service.get_user_by_phone(country_code, phone_number)
        if not user:
            user = self.user_service.create_user(
                UserRegistrationInput(
                    country_code=country_code,
                    phone_number=phone_number,
                    full_name=None,
                    email=None,
                    date_of_birth=None,
                    gender=None,
                    user_type="business",
                    client_type=client_type,
                )
            )
        return user

    async def business_verify_otp(self, data: OTPVerifyInput, response: Response, request: Request) -> LoginResponse:
        try:
            self.validate_otp_and_consume(data.country_code, data.phone_number, data.otp)
            client_type = detect_client_type(request, data.client_type)
            user = self.get_or_create_user_for_business_flow(
                data.country_code, data.phone_number, data.client_type
            )
            entity_id = UUID(str(user.uuid))  # type: ignore[arg-type]

            employee = self.employee_service.get_employee_by_phone(data.country_code, data.phone_number)
            if employee and (employee.user_id is None or employee.user_id == entity_id):
                self.role_controller.assign_role_to_user(user.uuid, "EMPLOYEE")  # type: ignore[arg-type]
                if employee.is_verified:
                    next_step = "dashboard"
                else:
                    next_step = "invitation_code"
                return await self.auth_service.generate_auth_response(
                    user,
                    response,
                    client_type,
                    user_type="EMPLOYEE",
                    next_step=next_step,
                    profile_type="EMPLOYEE",
                )

            business = self.business_service.get_business_by_owner(entity_id)
            if business:
                self.role_controller.assign_role_to_user(user.uuid, "BUSINESS")  # type: ignore[arg-type]
                if business.status is not None and int(business.status) >= BUSINESS_REGISTERED:  # type: ignore[arg-type]
                    next_step = "dashboard"
                else:
                    next_step = "business_registration"
                return await self.auth_service.generate_auth_response(
                    user,
                    response,
                    client_type,
                    user_type="BUSINESS",
                    next_step=next_step,
                    profile_type="BUSINESS",
                )

            if user.full_name and str(user.full_name).strip():
                next_step = "business_registration"
            else:
                next_step = "owner_info"
            return await self.auth_service.generate_auth_response(
                user,
                response,
                client_type,
                user_type="BUSINESS",
                next_step=next_step,
                profile_type="BUSINESS",
            )
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception:
            raise

    async def verify_otp(self, data: OTPVerifyInput, response: Response, request: Request) -> LoginResponse:
        if data.user_type and data.user_type.lower() == "customer":
            return await self.verify_otp_customer(data, response, request)
        return await self.business_verify_otp(data, response, request)

    async def verify_invitation_code(
        self, data: VerifyInvitationInput, response: Response, request: Request, user: User
    ) -> LoginResponse:
        """Verify employee invitation code: link current user to employee and return auth response."""
        employee = self.employee_service.get_employee_by_invitation_code(data.code)
        if not employee:
            raise HTTPException(
                status_code=400,
                detail={"message": "Invalid or expired invitation code."},
            )
        try:
            self.employee_service.activate_employee(employee.uuid, user.uuid)
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        client_type = detect_client_type(request, None)
        return await self.auth_service.generate_auth_response(
            user,
            response,
            client_type,
            user_type="EMPLOYEE",
            next_step="dashboard",
            profile_type="EMPLOYEE",
        )

    async def create_user(self, data: UserRegistrationInput, response: Response, request: Request) -> LoginResponse:
        try:
            user = RequestContext.get_user()
            if not user:
                raise HTTPException(status_code=401, detail="User not authenticated or not found.")

            updated_user = self.user_service.update_user_profile(user, data)
            client_type = detect_client_type(request, data.client_type)
            if data.user_type.lower() == "customer":
                self.role_controller.assign_role_to_user(updated_user.uuid, "CUSTOMER")  # type: ignore[arg-type]

            return await self.auth_service.generate_auth_response(
                updated_user, response, client_type, user_type=data.user_type
            )
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise e

    async def create_business_owner(self, data: UserRegistrationInput) -> UserData:
        try:
            user = RequestContext.get_user()
            if not user:
                raise HTTPException(status_code=401, detail="User not authenticated or not found.")

            updated_user = self.user_service.update_user_profile(user, data)
            return UserData.from_user(updated_user)
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise e

    async def update_user_profile(self, data: UserRegistrationInput, response: Response, request: Request) -> LoginResponse:
        try:
            user = RequestContext.get_user()
            if not user:
                raise HTTPException(status_code=401, detail="User not authenticated or not found.")

            updated_user = self.user_service.update_user_profile(user, data)
            client_type = detect_client_type(request, data.client_type)
            
            if data.user_type.lower() == "customer":
                self.role_controller.assign_role_to_user(updated_user.uuid, "CUSTOMER")  # type: ignore[arg-type]

            return await self.auth_service.generate_auth_response(
                updated_user, response, client_type, user_type=data.user_type
            )
        except HTTPException:
            raise
        except SQLAlchemyError as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")

    async def get_customer_profile(self, user: User) -> CustomerProfileResponse:
        if RequestContext.get_user_type() != "CUSTOMER":
            raise HTTPException(status_code=403, detail="Customer profile is only for customers")
        entity_id = UUID(str(user.uuid))  # type: ignore[arg-type]
        user_info = OwnerInfo.from_user(user)
        addresses = self.address_service.get_addresses_by_entity(EntityType.USER, entity_id)
        address = AddressData.from_address(addresses[0]) if addresses else None
        return CustomerProfileResponse(user=user_info, address=address)

    def get_primary_address(self, entity_type: EntityType, entity_id: UUID) -> Optional[AddressData]:
        addresses = self.address_service.get_addresses_by_entity(entity_type, entity_id)
        return AddressData.from_address(addresses[0]) if addresses else None

    def get_schedule_info(
        self, entity_id: UUID, entity_type: ScheduleEntityType, is_always_open: bool
    ) -> Optional[ScheduleInfo]:
        schedules = self.schedule_service.get_schedules_by_entity(entity_id, entity_type)
        if not schedules:
            return None
        return ScheduleInfo(
            is_always_open=is_always_open,
            schedules=[ScheduleData.from_schedule(s) for s in schedules],
        )

    async def get_business_profile(self, user: User) -> BusinessProfileResponse:
        user_type = RequestContext.get_user_type()
        if user_type not in ("BUSINESS", "EMPLOYEE"):
            raise HTTPException(status_code=403, detail="Business profile is only for business owners or employees")

        owner_info = OwnerInfo.from_user(user)
        entity_id = UUID(str(user.uuid))  # type: ignore[arg-type]

        if user_type == "EMPLOYEE":
            employee = self.employee_service.get_employee_by_user_id_with_relations(entity_id)
            if not employee:
                raise HTTPException(status_code=404, detail="Employee not found")
            business = employee.business
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            employee_info = EmployeeInfo.from_employee(employee, queue=employee.queue)
            entity_id = UUID(str(employee.uuid))  # type: ignore[arg-type]
            entity_type_addr = EntityType.EMPLOYEE
            entity_type_sched = ScheduleEntityType.EMPLOYEE
            is_always_open = False
        else:
            business = self.business_service.get_business_by_owner(entity_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            employee_info = None
            entity_id = UUID(str(business.uuid))  # type: ignore[arg-type]
            entity_type_addr = EntityType.BUSINESS
            entity_type_sched = ScheduleEntityType.BUSINESS
            is_always_open = bool(business.is_always_open)  # type: ignore[arg-type]

        address = self.get_primary_address(entity_type_addr, entity_id)
        schedule = self.get_schedule_info(entity_id, entity_type_sched, is_always_open)

        return BusinessProfileResponse(
            owner=owner_info,
            business=BusinessInfo.from_business(business),
            address=address,
            schedule=schedule,
            employee=employee_info,
        )

    async def get_employee_details(self, employee_id: UUID) -> EmployeeDetailsResponse:
        employee = self.employee_service.get_employee_by_id_with_relations(employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        employee_info = EmployeeInfo.from_employee(employee, queue=employee.queue)
        if employee.user:
            user_info = OwnerInfo.from_user(employee.user)
        else:
            user_info = self.user_info_from_employee(employee)
        address = self.get_primary_address(EntityType.EMPLOYEE, employee.uuid)
        schedule = self.get_schedule_info(employee.uuid, ScheduleEntityType.EMPLOYEE, False)
        queue_detail = self.build_queue_detail(employee.queue) if employee.queue else None
        return EmployeeDetailsResponse(
            user=user_info,
            address=address,
            schedule=schedule,
            employee=employee_info,
            queue_detail=queue_detail,
        )

    def build_queue_detail(self, queue) -> QueueDetailInfo:
        start_time = None
        if getattr(queue, "start_time", None) is not None and hasattr(queue.start_time, "strftime"):
            start_time = queue.start_time.strftime("%H:%M")
        end_time = None
        if getattr(queue, "end_time", None) is not None and hasattr(queue.end_time, "strftime"):
            end_time = queue.end_time.strftime("%H:%M")
        services = []
        for qs in getattr(queue, "queue_services", []) or []:
            svc = getattr(qs, "service", None)
            name = (svc.name if svc else None) or ""
            description = getattr(qs, "description", None) or (getattr(svc, "description", None) if svc else None)
            services.append(
                QueueDetailServiceData(
                    uuid=str(qs.uuid),
                    name=name,
                    description=description,
                    service_fee=getattr(qs, "service_fee", None),
                    avg_service_time=getattr(qs, "avg_service_time", None),
                )
            )
        return QueueDetailInfo(
            uuid=str(queue.uuid),
            business_id=str(queue.merchant_id),
            name=queue.name,
            status=queue.status,
            limit=getattr(queue, "limit", None),
            start_time=start_time,
            end_time=end_time,
            current_length=getattr(queue, "current_length", None),
            serves_num=getattr(queue, "serves_num", None),
            is_counter=getattr(queue, "is_counter", None),
            services=services,
        )

    def user_info_from_employee(self, employee) -> OwnerInfo:
        return OwnerInfo(
            uuid=str(employee.uuid),
            full_name=getattr(employee, "full_name", None),
            email=getattr(employee, "email", None),
            phone_number=getattr(employee, "phone_number", None) or "",
            country_code=getattr(employee, "country_code", None) or "",
            profile_picture=getattr(employee, "profile_picture", None),
            date_of_birth=None,
            gender=None,
        )

    async def get_profile(self, user: User) -> UnifiedProfileResponse:
        user_type = RequestContext.get_user_type()
        user_info = OwnerInfo.from_user(user)
        entity_id = UUID(str(user.uuid))  # type: ignore[arg-type]
        if user_type == "BUSINESS":
            business = self.business_service.get_business_by_owner(entity_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            addresses = self.address_service.get_addresses_by_entity(EntityType.BUSINESS, UUID(str(business.uuid)))  # type: ignore[arg-type]
            address = AddressData.from_address(addresses[0]) if addresses else None
            schedules = self.schedule_service.get_schedules_by_entity(UUID(str(business.uuid)), ScheduleEntityType.BUSINESS)  # type: ignore[arg-type]
            return UnifiedProfileResponse(
                profile_type="BUSINESS",
                user=user_info,
                business=BusinessInfo.from_business(business),
                address=address,
                schedule=ScheduleInfo(
                    is_always_open=bool(business.is_always_open),  # type: ignore[arg-type]
                    schedules=[ScheduleData.from_schedule(s) for s in schedules]
                ) if schedules else None
            )

        if user_type == "EMPLOYEE":
            employee = self.employee_service.get_employee_by_user_id_with_relations(entity_id)
            if not employee:
                raise HTTPException(status_code=404, detail="Employee not found")
            business = employee.business
            addresses = self.address_service.get_addresses_by_entity(EntityType.EMPLOYEE, UUID(str(employee.uuid)))  # type: ignore[arg-type]
            address = AddressData.from_address(addresses[0]) if addresses else None
            schedules = self.schedule_service.get_schedules_by_entity(UUID(str(employee.uuid)), ScheduleEntityType.EMPLOYEE)  # type: ignore[arg-type]
            return UnifiedProfileResponse(
                profile_type="EMPLOYEE",
                user=user_info,
                business=BusinessInfo.from_business(business) if business else None,
                employee=EmployeeInfo.from_employee(employee, queue=employee.queue),
                address=address,
                schedule=ScheduleInfo(
                    is_always_open=False,
                    schedules=[ScheduleData.from_schedule(s) for s in schedules]
                ) if schedules else None
            )

        addresses = self.address_service.get_addresses_by_entity(EntityType.USER, entity_id)
        address = AddressData.from_address(addresses[0]) if addresses else None
        return UnifiedProfileResponse(
            profile_type="CUSTOMER",
            user=user_info,
            address=address
        )
