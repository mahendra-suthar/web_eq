import contextvars
from typing import Optional, List

from app.models.user import User


user_context: contextvars.ContextVar[Optional[User]] = contextvars.ContextVar("user_context", default=None)
user_type_context: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("user_type_context", default=None)
jwt_payload_context: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar("jwt_payload_context", default=None)

class RequestContext:
    @staticmethod
    def set_user(user: User) -> None:
        user_context.set(user)
    
    @staticmethod
    def get_user() -> Optional[User]:
        return user_context.get()
    
    @staticmethod
    def set_user_type(user_type: Optional[str]) -> None:
        user_type_context.set(user_type.upper() if user_type else "CUSTOMER")
    
    @staticmethod
    def get_user_type() -> Optional[str]:
        return user_type_context.get()
    
    @staticmethod
    def set_jwt_payload(payload: dict) -> None:
        jwt_payload_context.set(payload)
    
    @staticmethod
    def get_jwt_payload() -> Optional[dict]:
        return jwt_payload_context.get()
    
    @staticmethod
    def clear() -> None:
        user_context.set(None)
        user_type_context.set(None)
        jwt_payload_context.set(None)
