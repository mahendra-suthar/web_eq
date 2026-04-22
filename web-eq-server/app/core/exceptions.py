import logging
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger(__name__)


def handle_integrity_error(exc: IntegrityError, context: str = "") -> None:
    """Parse IntegrityError, log with context, raise a user-friendly HTTPException (409)."""
    logger.warning("IntegrityError [%s]: %s", context, exc.orig)
    orig = str(exc.orig).lower()
    if "email" in orig:
        msg = "This email is already registered to another account."
    elif "phone" in orig:
        msg = "This phone number is already registered to another account."
    else:
        msg = "A record with this information already exists."
    raise HTTPException(status_code=409, detail={"message": msg})
