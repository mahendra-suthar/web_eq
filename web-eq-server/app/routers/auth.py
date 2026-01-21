from fastapi import APIRouter, Depends, Response, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.auth import OTPRequestInput, OTPRequestResponse, OTPVerifyInput, UserRegistrationInput
from app.schemas.user import LoginResponse, UserData
from app.schemas.profile import UnifiedProfileResponse
from app.controllers.auth_controller import AuthController
from app.models.user import User
from app.middleware.permissions import get_current_user


auth_router = APIRouter()


@auth_router.post("/send-otp", response_model=OTPRequestResponse)
async def send_otp(payload: OTPRequestInput, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.send_otp(payload)


@auth_router.post("/verify-otp", response_model=LoginResponse)
async def verify_otp(payload: OTPVerifyInput, response: Response, request: Request, db: Session = Depends(get_db)):
    controller = AuthController(db)
    return await controller.verify_otp(payload, response, request)


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