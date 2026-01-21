from fastapi import HTTPException
from typing import List, Optional

from app.models.user import User
from app.core.context import RequestContext


def get_current_user() -> User:
    """
    Get current user from context (loaded by middleware).
    No DB query - user is already in context!
    """
    user = RequestContext.get_user()
    
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


def get_user_type() -> str:
    """
    Get user_type from context (loaded by middleware from token).
    No DB query - user_type is already in context!
    """
    user_type = RequestContext.get_user_type()
    
    if not user_type:
        return ""
    
    return user_type.upper()


def require_roles(allowed_roles: List[str]):
    """
    Ultra-optimized dependency factory using context.
    Zero DB queries - user_type is read from token!
    
    Usage:
        @router.get("/endpoint")
        async def endpoint(user: User = Depends(require_roles(["ADMIN"]))):
            ...
    """
    def role_checker() -> Optional[User]:
        user_type = RequestContext.get_user_type()
        if not user_type:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        
        user_type_upper = user_type.upper()
        allowed_upper = [r.upper() for r in allowed_roles]
        
        if user_type_upper not in allowed_upper:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required roles: {', '.join(allowed_roles)}"
            )
        
        user = RequestContext.get_user()
        if not user:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        return user
    
    return role_checker
