from uuid import UUID

from fastapi import APIRouter, Depends, Response, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.middleware.permissions import get_current_user, require_roles
from app.schemas.auth import OTPRequestInput, OTPRequestResponse, OTPVerifyInput, UserRegistrationInput, VerifyInvitationInput
from app.schemas.user import LoginResponse, UserData
from app.schemas.profile import UnifiedProfileResponse, CustomerProfileResponse, BusinessProfileResponse, EmployeeDetailsResponse
from app.controllers.auth_controller import AuthController
from app.models.user import User


auth_router = APIRouter()


@auth_router.post("/send-otp", response_model=OTPRequestResponse)
async def send_otp(payload: OTPRequestInput, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.send_otp(payload)


@auth_router.post("/verify-otp", response_model=LoginResponse)
async def verify_otp(payload: OTPVerifyInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.verify_otp(payload, response, request)


@auth_router.post("/verify-otp-customer", response_model=LoginResponse)
async def verify_otp_customer(payload: OTPVerifyInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.verify_otp_customer(payload, response, request)


@auth_router.post("/business-verify-otp", response_model=LoginResponse)
async def business_verify_otp(payload: OTPVerifyInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.business_verify_otp(payload, response, request)


@auth_router.post("/verify-invitation-code", response_model=LoginResponse)
async def verify_invitation_code(
    payload: VerifyInvitationInput,
    response: Response,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = AuthController(db)
    return await controller.verify_invitation_code(payload, response, request, user)


@auth_router.post("/create-user", response_model=LoginResponse)
async def create_user(payload: UserRegistrationInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.create_user(payload, response, request)


@auth_router.post("/create-business-owner", response_model=UserData)
async def create_business_owner(payload: UserRegistrationInput, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.create_business_owner(payload)


@auth_router.put("/update-profile", response_model=LoginResponse)
async def update_user_profile(payload: UserRegistrationInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.update_user_profile(payload, response, request)


@auth_router.get("/profile", response_model=UnifiedProfileResponse)
async def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.get_profile(user)


@auth_router.get("/profile/customer", response_model=CustomerProfileResponse)
async def get_customer_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.get_customer_profile(user)


@auth_router.get("/profile/business", response_model=BusinessProfileResponse)
async def get_business_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.get_business_profile(user)


@auth_router.get(
    "/profile/employee/{employee_id}",
    response_model=EmployeeDetailsResponse,
    dependencies=[Depends(require_roles(["BUSINESS"]))],
)
async def get_employee_profile_route(employee_id: UUID, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.get_employee_details(employee_id)