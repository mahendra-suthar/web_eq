from fastapi import Response
from sqlalchemy.orm import Session
from typing import Optional
from datetime import timedelta

from app.models.user import User
from app.middleware.auth import create_access_token, get_access_token_expires_time
from app.core.config import SAMESITE, ISSECURE
from app.schemas.user import LoginResponse, Token, UserData
from app.core.context import RequestContext

class AuthService:
    def __init__(self, db: Session):
        self.db = db

    async def set_auth_cookie(
        self, response: Response, token: str, client_type: str = "web", user_type: Optional[str] = None,
    ) -> None:
        if client_type != "web":
            return

        user_type_upper = (user_type or "").upper()
        cookie_name = "customer_access_token" if user_type_upper == "CUSTOMER" else "access_token"

        response.set_cookie(
            key=cookie_name,
            value=token,
            httponly=True,
            secure=ISSECURE,
            samesite=SAMESITE,
            path="/",
            max_age=60 * 60 * 24,
        )

    async def generate_auth_response(
        self,
        user: User,
        response: Response,
        client_type: str = "web",
        user_type: Optional[str] = None,
        next_step: Optional[str] = None,
        profile_type: Optional[str] = None,
    ) -> LoginResponse:
        """Generate authentication response after user registration/login."""
        expires_delta = get_access_token_expires_time(client_type)
        user_type_upper = user_type.upper() if user_type else None
        token_data = {"sub": str(user.uuid), "user_type": user_type_upper, "client_type": client_type}
        access_token = create_access_token(token_data, expires_delta)

        await self.set_auth_cookie(response, access_token, client_type, user_type)

        RequestContext.set_user(user)
        RequestContext.set_user_type(user_type_upper)

        user_data = UserData.from_user(user)
        return LoginResponse(
            token=Token(access_token=access_token, token_type="Bearer"),
            user=user_data,
            next_step=next_step,
            profile_type=profile_type,
        )