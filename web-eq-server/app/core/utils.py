import secrets
import hashlib
from datetime import time as dt_time
from typing import Optional

from app.core.constants import TIME_FORMAT


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

