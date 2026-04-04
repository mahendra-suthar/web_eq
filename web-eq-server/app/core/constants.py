from datetime import time as _time

UNPROTECTED_ROUTE_PATHS = [
    "/healthz",                           # Render / load balancer health checks
    # ── Auth ─────────────────────────────────────────────────────────────────
    "/api/auth/send-otp",
    "/api/auth/verify-otp",
    "/api/auth/verify-otp-customer",
    "/api/auth/business-verify-otp",
    "/api/auth/logout",                   # Cookie clear — must work even when session is expired
    # ── Public catalogue reads ────────────────────────────────────────────────
    "/api/category/",                     # get_categories, tree
    "/api/service/get_services",          # services by category (no trailing slash)
    "/api/service/get_all_services",
    "/api/service/get_services_by_business/",
    "/api/business/get_businesses",
    "/api/business/get_business_details/",
    "/api/business/get_business_services/",
    "/api/review/get_business_reviews/",         # per-business review list
    "/api/review/get_business_review_summary/", # per-business rating summary
    "/api/review/featured",                     # landing page featured reviews
    "/api/queue/available_slots/",        # public slot viewing
    # ── Docs ─────────────────────────────────────────────────────────────────
    "/api/docs",
    "/api/openapi.json",
    "/api/redoc",
    # ── WebSockets (auth handled inside each handler) ─────────────────────────
    "/api/ws/booking/",
    "/api/ws/live/",
    "/api/ws/notifications/",
]

# Mobile User-Agent patterns for client type detection
MOBILE_USER_AGENT_PATTERNS = [
    r"android",
    r"iphone",
    r"ipad",
    r"ipod",
    r"mobile",
    r"react-native",
    r"flutter",
    r"xamarin"
]

# Business status constants
BUSINESS_DRAFT = 0
BUSINESS_REGISTERED = 1
BUSINESS_ACTIVE = 2
BUSINESS_SUSPENDED = 3
BUSINESS_INACTIVE = 4
BUSINESS_TERMINATED = 5

# Queue status constants
QUEUE_REGISTERED = 1
QUEUE_RUNNING = 2
QUEUE_STOPPED = 3

# Queue service status constants
QUEUE_SERVICE_REGISTERED = 1

# Queue user status constants
QUEUE_USER_REGISTERED = 1
QUEUE_USER_IN_PROGRESS = 2
QUEUE_USER_COMPLETED = 3
QUEUE_USER_FAILED = 4
QUEUE_USER_CANCELLED = 5
QUEUE_USER_PRIORITY_REQUESTED = 6
QUEUE_USER_EXPIRED = 7          # Auto-expired by scheduler: past-day, never served

# Customer API defaults (appointments list pagination)
CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT = 5
CUSTOMER_APPOINTMENTS_MAX_LIMIT = 100

# Time format constants
TIME_FORMAT = "%I:%M %p"
TIME_FORMAT_HM = "%H:%M"
TIMEZONE = "Asia/Kolkata"

# Business "always open" time bounds (used for schedule validation and defaults)
BIZ_EARLIEST_TIME = _time(0, 0)
BIZ_LATEST_TIME = _time(23, 59)

# Booking / queue calculation defaults
DEFAULT_AVG_TIME = 15          # minutes per slot when no historical data exists
DEFAULT_OPEN_TIME = _time(9, 0)  # fallback opening time when no schedule is configured
DEFAULT_SLOT_MINUTES = 15      # fallback slot duration when queue has no services (min floor)
SLOT_DURATION_FLOOR = 10       # minimum slot length in minutes
SLOT_DURATION_CEILING = 60     # maximum slot length in minutes

# Queue booking modes
BOOKING_MODE_QUEUE = "QUEUE"
BOOKING_MODE_FIXED = "FIXED"
BOOKING_MODE_APPROXIMATE = "APPROXIMATE"
BOOKING_MODE_HYBRID = "HYBRID"

# Appointment types (queue_user)
APPOINTMENT_TYPE_QUEUE = "QUEUE"
APPOINTMENT_TYPE_FIXED = "FIXED"
APPOINTMENT_TYPE_APPROXIMATE = "APPROXIMATE"

# Notification event type constants
NOTIF_BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
NOTIF_NEW_CUSTOMER      = "NEW_CUSTOMER"
NOTIF_IN_SERVICE        = "IN_SERVICE"
NOTIF_CALLED_NEXT       = "CALLED_NEXT"
NOTIF_SERVICE_COMPLETED = "SERVICE_COMPLETED"