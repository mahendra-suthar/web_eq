import secrets
import hashlib
from datetime import date, datetime, time as dt_time, timezone, timedelta
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import pytz

from app.core.constants import (
    BIZ_EARLIEST_TIME,
    BIZ_LATEST_TIME,
    QUEUE_USER_COMPLETED,
    QUEUE_USER_IN_PROGRESS,
    QUEUE_USER_REGISTERED,
    TIME_FORMAT,
    TIMEZONE,
)

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

_APP_TZ = pytz.timezone(TIMEZONE)
APP_TZ = _APP_TZ  # public alias — import this in services that need the timezone object
_UTC_MIN = datetime.min.replace(tzinfo=timezone.utc)


def now_utc() -> datetime:
    """Return current UTC time (timezone-aware)."""
    return datetime.now(timezone.utc)


def now_app_tz() -> datetime:
    """Return current time in the application timezone (Asia/Kolkata)."""
    return datetime.now(_APP_TZ)


def today_app_date() -> date:
    """Return today's date in the application timezone (Asia/Kolkata).

    Use this instead of date.today() so queries match IST-based queue_date values,
    regardless of the server's UTC clock.
    """
    return now_app_tz().date()


def current_time_app_tz() -> dt_time:
    """Return current time (time only) in the application timezone. For open/closed checks."""
    return now_app_tz().time()


def day_of_week_app_tz() -> int:
    """Return current day of week in app TZ using JS convention: 0=Sunday, 1=Monday, …, 6=Saturday."""
    return (now_app_tz().weekday() + 1) % 7


def is_full_day(schedule: Any) -> bool:
    """Return True if the schedule represents a full day (00:00–23:59 or no times = 24/7).

    *schedule* must have is_open, opening_time, closing_time (or None). Used for
    "always open" derivation: only full-day schedules count as always open.
    """
    if not getattr(schedule, "is_open", False):
        return False
    ot = getattr(schedule, "opening_time", None)
    ct = getattr(schedule, "closing_time", None)
    if ot is None and ct is None:
        return True
    if ot is not None and ct is not None:
        return ot <= BIZ_EARLIEST_TIME and ct >= BIZ_LATEST_TIME
    return False


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


def format_date_iso(d: date) -> str:
    """Format date as ISO string (YYYY-MM-DD) for API/keys."""
    return d.isoformat()


def appointment_time_to_enqueue_dequeue(
    appointment_time_str: Optional[str],
    appointment_date: date,
    duration_minutes: int,
) -> Tuple[Optional[datetime], Optional[datetime]]:
    """
    Parse HH:MM appointment time and return (enqueue datetime, dequeue datetime)
    for the given date and duration. Naive datetimes (for DB storage).
    """
    t = parse_time_string(appointment_time_str)
    if t is None:
        return (None, None)
    enqueue = datetime.combine(appointment_date, t)
    dequeue = enqueue + timedelta(minutes=duration_minutes)
    return (enqueue, dequeue)


def format_time(t: Optional[dt_time]) -> Optional[str]:
    """Format time object to 12-hour string like '09:00 AM'"""
    if not t:
        return None
    return t.strftime(TIME_FORMAT)


def live_queue_key(queue_id: str, date_str: str) -> str:
    """Channel key for live queue WebSocket clients: {queue_id}:{date_str}."""
    return f"{queue_id}:{date_str}"


def now_iso(tz_name: str = TIMEZONE) -> str:
    """Current time in the given timezone as ISO string."""
    tz = pytz.timezone(tz_name)
    return datetime.now(tz).isoformat()


def format_time_12h(dt: Optional[datetime]) -> str:
    """Format datetime to 12-hour display string (e.g. '4:30 PM'). Naive treated as app TZ."""
    if dt is None:
        return ""
    try:
        if dt.tzinfo is None:
            dt = _APP_TZ.localize(dt)
        else:
            dt = dt.astimezone(_APP_TZ)
        s = dt.strftime("%I:%M %p")
        return s.lstrip("0") if s[0] == "0" else s  # "04:30 PM" -> "4:30 PM"
    except Exception:
        return ""


def wait_minutes_from_now(estimated_enqueue_time: Optional[datetime]) -> Optional[int]:
    """Estimated wait in minutes from now until estimated_enqueue_time. Naive dt treated as app TZ."""
    if estimated_enqueue_time is None:
        return None
    try:
        if estimated_enqueue_time.tzinfo is None:
            target = _APP_TZ.localize(estimated_enqueue_time)
        else:
            target = estimated_enqueue_time.astimezone(_APP_TZ)
        now = now_app_tz()
        delta_seconds = (target - now).total_seconds()
        return max(0, int(round(delta_seconds / 60)))
    except Exception:
        return None


def json_safe(obj: Any) -> Any:
    """Recursively convert any non-JSON-serialisable value to a safe type.

    Handles: datetime → ISO string, date → ISO string, time → HH:MM string,
    UUID → str, Decimal → float, Enum → value, tuple → list.
    """
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, datetime):           # before date — datetime IS a date
        return serialise_dt(obj)
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, dt_time):
        return obj.strftime("%H:%M")
    if isinstance(obj, UUID):
        return str(obj)
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, Enum):
        return obj.value
    return obj


def serialise_dt(val: Any) -> Optional[str]:
    """Serialize a datetime (or None) to ISO string for JSON.

    Timezone-aware datetimes are converted to the app timezone (IST) before
    serialization so API consumers always receive local timestamps.
    """
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is not None:
            val = val.astimezone(_APP_TZ)
        return val.isoformat()
    return str(val)


def sort_key_live_queue_row(row: Tuple[Any, Any]) -> tuple:
    """
    Sort key for live queue (QueueUser, User) rows:
    completed (0) → in_progress (1) → waiting (2), with secondary key by time.
    Uses a tz-aware sentinel so comparison with DB timestamps never raises TypeError.
    """
    qu = row[0]
    if qu.status == QUEUE_USER_COMPLETED:
        return (0, qu.dequeue_time or qu.created_at or _UTC_MIN)
    if qu.status == QUEUE_USER_IN_PROGRESS:
        return (1, qu.enqueue_time or qu.created_at or _UTC_MIN)
    return (2, qu.enqueue_time or qu.created_at or _UTC_MIN)


def build_live_queue_users_raw(
    rows: List[Tuple[Any, Any]], svc_by_user: Dict[Any, List[str]]
) -> List[Dict[str, Any]]:
    """
    Build the list of user dicts for live queue from raw DB rows and service names.
    Expects rows already sorted by sort_key_live_queue_row; will sort if not.
    """
    if not rows:
        return []
    rows = sorted(rows, key=sort_key_live_queue_row)
    result: List[Dict[str, Any]] = []
    waiting_pos = 0
    for qu, user in rows:
        if qu.status == QUEUE_USER_REGISTERED:
            waiting_pos += 1
            pos: Optional[int] = waiting_pos
        else:
            pos = None
        names = svc_by_user.get(qu.uuid, [])
        st = getattr(qu, "scheduled_start", None)
        se = getattr(qu, "scheduled_end", None)
        result.append({
            "uuid": str(qu.uuid),
            "full_name": user.full_name,
            "phone": f"{user.country_code or ''} {user.phone_number or ''}".strip(),
            "token": qu.token_number,
            "service_summary": " · ".join(names) if names else "",
            "status": qu.status,
            "turn_time": getattr(qu, "turn_time", None),
            "enqueue_time": qu.enqueue_time,
            "dequeue_time": qu.dequeue_time,
            "position": pos,
            "estimated_enqueue_time": getattr(qu, "estimated_enqueue_time", None),
            "estimated_dequeue_time": getattr(qu, "estimated_dequeue_time", None),
            "appointment_type": getattr(qu, "appointment_type", None) or "QUEUE",
            "scheduled_start": st.strftime("%H:%M") if st else None,
            "scheduled_end": se.strftime("%H:%M") if se else None,
            "delay_minutes": getattr(qu, "delay_minutes", None),
        })
    return result

