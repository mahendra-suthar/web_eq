import secrets
import hashlib
from datetime import datetime, time as dt_time, timezone
from typing import Optional

from app.core.constants import TIME_FORMAT

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def now_utc() -> datetime:
    """Return current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)
    

def generate_invitation_code(length: int = 8, expires_in_hours: Optional[int] = 48) -> str:
    """Generate a random invitation code (no ambiguous chars: 0, 1, I, L, O).
    expires_in_hours is for API consistency; callers can use it when storing/validating expiry.
    """
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


def generate_otp(length: int = 5) -> str:
    """Generate a random numeric OTP of specified length"""
    return ''.join(str(secrets.randbelow(10)) for _ in range(length))


def hash_otp(otp: str) -> str:
    """Hash OTP using SHA256"""
    return hashlib.sha256(otp.encode()).hexdigest()


def parse_time_string(time_str: Optional[str]) -> Optional[dt_time]:
    """Parse time string in HH:MM format to time object"""
    if not time_str:
        return None
    try:
        parts = time_str.split(":")
        if len(parts) == 2:
            return dt_time(hour=int(parts[0]), minute=int(parts[1]))
    except (ValueError, IndexError):
        pass
    return None

def format_time(t: Optional[dt_time]) -> Optional[str]:
    """Format time object to 12-hour string like '09:00 AM'"""
    if not t:
        return None
    return t.strftime(TIME_FORMAT)

