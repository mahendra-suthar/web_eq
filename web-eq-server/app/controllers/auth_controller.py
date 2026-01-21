import secrets
from typing import List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta
from fastapi import HTTPException, Response, Request

from app.services.otp_service import OTPService
from app.services.auth_service import AuthService
from app.services.user_service import UserService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.services.address_service import AddressService
from app.services.schedule_service import ScheduleService
from app.controllers.role_controller import RoleController
from app.middleware.auth import detect_client_type
from app.core.utils import hash_otp
from app.core.config import RATE_LIMIT_PER_HOUR, OTP_EXPIRY_MINUTES
from app.models.user import User
from app.models.address import EntityType
from app.models.schedule import ScheduleEntityType
from app.schemas.auth import (
    OTPRequestInput, OTPRequestResponse, OTPRequestErrorCode, OTPVerifyInput,
    OTPVerifyErrorCode, UserRegistrationInput
)
from app.schemas.user import LoginResponse, UserData
from app.schemas.profile import (
    UnifiedProfileResponse, OwnerInfo, BusinessInfo, EmployeeInfo, ScheduleInfo, AddressData
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

    async def send_otp(self, data: OTPRequestInput) -> OTPRequestResponse:
        try:
            country_code = data.country_code
            phone_number = data.phone_number
            
            one_hour_ago = datetime.utcnow() - timedelta(hours=1)
            recent_attempts = self.otp_service.get_recent_otp_attempts(
                data.country_code, data.phone_number, one_hour_ago
            )
            
            if recent_attempts >= RATE_LIMIT_PER_HOUR:
                raise HTTPException(
                    status_code=429,
                    detail={
                        "error_code": OTPRequestErrorCode.RATE_LIMIT_EXCEEDED.value,
                        "message": "Rate limit exceeded. Please try again later."
                    }
                )

            otp = ''.join(str(secrets.randbelow(10)) for _ in range(5))
            hashed = hash_otp(otp)
            expires_at = datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES)

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
        except Exception as e:
            raise e

    async def verify_otp(self, data: OTPVerifyInput, response: Response, request: Request) -> LoginResponse:
        try:
            country_code = data.country_code
            phone_number = data.phone_number
            otp = data.otp

            client_type = detect_client_type(request, data.client_type)
            otp_record = self.otp_service.get_latest_otp(country_code, phone_number)
            if not otp_record:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error_code": OTPVerifyErrorCode.OTP_NOT_FOUND.value,
                        "message": "OTP not found"
                    }
                )

            if int(otp_record.status) == 2:  # type: ignore[arg-type]
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error_code": OTPVerifyErrorCode.OTP_ALREADY_USED.value,
                        "message": "OTP already used"
                    }
                )

            if otp_record.expires_at is not None and otp_record.expires_at < datetime.utcnow():  # type: ignore[operator]
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error_code": OTPVerifyErrorCode.OTP_EXPIRED.value,
                        "message": "OTP expired"
                    }
                )

            if str(otp_record.otp_hash) != hash_otp(otp):  # type: ignore[arg-type]
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error_code": OTPVerifyErrorCode.OTP_INVALID.value,
                        "message": "Invalid OTP"
                    }
                )

            self.otp_service.mark_otp_used(otp_record)
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
                        user_type=data.user_type,
                        client_type=data.client_type,
                    )
                )
                self.role_controller.assign_role_to_user(user.uuid, "CUSTOMER")  # type: ignore[arg-type]

            return await self.auth_service.generate_auth_response(
                user, response, client_type, user_type=data.user_type
            )
        except HTTPException:
            raise
        except SQLAlchemyError:
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise e

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

    async def get_profile(self, user: User) -> UnifiedProfileResponse:
        user_type = RequestContext.get_user_type()
        user_info = OwnerInfo.from_user(user)
        entity_id = UUID(str(user.uuid))  # type: ignore
        if user_type == "BUSINESS":
            business = self.business_service.get_business_by_owner(entity_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            addresses = self.address_service.get_addresses_by_entity(EntityType.BUSINESS, UUID(str(business.uuid)))  # type: ignore
            address = AddressData.from_address(addresses[0]) if addresses else None
            schedules = self.schedule_service.get_schedules_by_entity(UUID(str(business.uuid)), ScheduleEntityType.BUSINESS)  # type: ignore
            return UnifiedProfileResponse(
                profile_type="BUSINESS",
                user=user_info,
                business=BusinessInfo.from_business(business),
                address=address,
                schedule=ScheduleInfo(
                    is_always_open=bool(business.is_always_open),  # type: ignore
                    schedules=[ScheduleData.from_schedule(s) for s in schedules]
                ) if schedules else None
            )
        
        elif user_type == "EMPLOYEE":
            employee = self.employee_service.get_employee_by_user_id(entity_id)
            if not employee:
                raise HTTPException(status_code=404, detail="Employee not found")
            
            business = self.business_service.get_business_by_id(UUID(str(employee.business_id)))  # type: ignore
            addresses = self.address_service.get_addresses_by_entity(EntityType.EMPLOYEE, UUID(str(employee.uuid)))  # type: ignore
            address = AddressData.from_address(addresses[0]) if addresses else None
            schedules = self.schedule_service.get_schedules_by_entity(UUID(str(employee.uuid)), ScheduleEntityType.EMPLOYEE)  # type: ignore
            
            return UnifiedProfileResponse(
                profile_type="EMPLOYEE",
                user=user_info,
                business=BusinessInfo.from_business(business) if business else None,
                employee=EmployeeInfo.from_employee(employee),
                address=address,
                schedule=ScheduleInfo(
                    is_always_open=False,
                    schedules=[ScheduleData.from_schedule(s) for s in schedules]
                ) if schedules else None
            )
        
        else:
            addresses = self.address_service.get_addresses_by_entity(EntityType.USER, entity_id)
            address = AddressData.from_address(addresses[0]) if addresses else None
            
            return UnifiedProfileResponse(
                profile_type="CUSTOMER",
                user=user_info,
                address=address
            )
            
