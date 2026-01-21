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


class AuthMiddleware(BaseHTTPMiddleware):    
    async def dispatch(self, request: Request, call_next):
        if request.method.upper() == "OPTIONS":
            return await call_next(request)

        if any(request.url.path.startswith(route) for route in UNPROTECTED_ROUTE_PATHS):
            return await call_next(request)
        
        token = extract_token(request)
        
        if not token:
            return JSONResponse(
                status_code=401,
                content={"detail": "Not authenticated"}
            )
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            RequestContext.set_jwt_payload(payload)
            RequestContext.set_user_type(payload.get("user_type"))

            user_id = payload.get("sub")
            
            if not user_id:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid token: no subject"}
                )
            
            db = SessionLocal()
            try:
                user = db.query(User).filter(User.uuid == UUID(user_id)).first()
                
                if not user:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "User not found"}
                    )
                
                RequestContext.set_user(user)
                
            finally:
                db.close()
            
            response = await call_next(request)
            return response
            
        except JWTError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"}
            )
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid user ID format"}
            )
