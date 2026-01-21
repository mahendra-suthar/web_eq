import re
import secrets
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import Request
from jose import jwt, JWTError

from app.core.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, MOBILE_TOKEN_EXPIRE_DAYS, WEB_TOKEN_EXPIRE_MINUTES
from app.core.constants import MOBILE_USER_AGENT_PATTERNS


def get_access_token_expires_time(client_type: str = "web") -> Optional[timedelta]:
    if client_type == "mobile":
        if MOBILE_TOKEN_EXPIRE_DAYS is None:
            return None  # Never expires
        return timedelta(days=MOBILE_TOKEN_EXPIRE_DAYS)
    else:  # web
        return timedelta(minutes=WEB_TOKEN_EXPIRE_MINUTES)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    to_encode["iat"] = datetime.now(timezone.utc)
    to_encode["jti"] = secrets.token_urlsafe(32)
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode["exp"] = expire
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("access_token")
    if token:
        return token
    
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1]
    
    return None


def detect_client_type(request: Request, client_type_param: Optional[str] = None) -> str:
    if client_type_param:
        return client_type_param.lower()
    
    user_agent = request.headers.get("User-Agent", "").lower()
    
    for pattern in MOBILE_USER_AGENT_PATTERNS:
        if re.search(pattern, user_agent):
            return "mobile"
    
    return "web"

