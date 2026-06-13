import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from jose import jwt, JWTError
from uuid import UUID

from app.core.config import SECRET_KEY, ALGORITHM
from app.middleware.auth import extract_token
from app.db.database import SessionLocal
from app.models.user import User
from app.core.context import RequestContext
from app.core.constants import UNPROTECTED_ROUTE_PATHS

logger = logging.getLogger(__name__)


def auth_error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": {"message": message}})

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        if any(request.url.path.startswith(route) for route in UNPROTECTED_ROUTE_PATHS):
            return await call_next(request)

        token = extract_token(request)

        if not token:
            return auth_error(401, "Not authenticated. Please log in.")

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            return auth_error(401, "Invalid or expired session. Please log in again.")

        RequestContext.set_jwt_payload(payload)
        RequestContext.set_user_type(payload.get("user_type"))

        user_id = payload.get("sub")
        if not user_id:
            return auth_error(401, "Invalid session. Please log in again.")

        try:
            user_uuid = UUID(user_id)
        except (ValueError, TypeError):
            return auth_error(401, "Invalid session. Please log in again.")

        try:
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.uuid == user_uuid).first()
            finally:
                db.close()
        except Exception:
            logger.exception("Auth middleware: failed to load user on %s", request.url.path)
            return auth_error(500, "An unexpected error occurred. Please try again.")

        if not user:
            return auth_error(401, "Account not found. Please log in again.")

        RequestContext.set_user(user)

        return await call_next(request)
