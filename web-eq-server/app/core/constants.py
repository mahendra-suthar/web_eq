UNPROTECTED_ROUTE_PATHS = [
    "/api/auth/send-otp",
    "/api/auth/verify-otp",
    "/api/auth/verify-otp-customer",
    "/api/auth/business-verify-otp",
    "/api/category/get_categories",
    "/api/category/get_categories_with_services",
    "/api/business/get_businesses",
    "/api/business/get_business_details/",  # Allow all business detail and service endpoints
    "/api/business/get_business_services/",  # Allow all business detail and service endpoints
    "/api/queue/available_slots/",  # Public slot viewing
    "/api/review/business/",  # Public review viewing
    "/api/docs",
    "/api/openapi.json",
    "/api/redoc"
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

# Time format constants
TIME_FORMAT = "%I:%M %p"
TIMEZONE = "Asia/Kolkata"
