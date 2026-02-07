import os
from dotenv import load_dotenv

load_dotenv()

# Database configuration
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "web_eq_db")
DB_ECHO_LOGS = os.getenv("DB_ECHO_LOGS", "False").lower() == "true"

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "secretkey")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# OTP configuration
OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "5"))
RATE_LIMIT_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "5"))

# Default country code
DEFAULT_COUNTRY_CODE = os.getenv("DEFAULT_COUNTRY_CODE", "+91")

# Cookie configuration
SAMESITE = os.getenv("SAMESITE", "lax")
ISSECURE = os.getenv("ISSECURE", "False").lower() == "true"

# Token expiry configuration
MOBILE_TOKEN_EXPIRE_DAYS = os.getenv("MOBILE_TOKEN_EXPIRE_DAYS")
if MOBILE_TOKEN_EXPIRE_DAYS:
    MOBILE_TOKEN_EXPIRE_DAYS = int(MOBILE_TOKEN_EXPIRE_DAYS)
else:
    MOBILE_TOKEN_EXPIRE_DAYS = None  # Never expires by default for mobile

WEB_TOKEN_EXPIRE_MINUTES = int(os.getenv("WEB_TOKEN_EXPIRE_MINUTES", "60"))

# Redis configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# Queue configuration
MAX_QUEUE_SIZE = int(os.getenv("MAX_QUEUE_SIZE", "50"))
AVG_WAIT_TIME_PER_USER = int(os.getenv("AVG_WAIT_TIME_PER_USER", "5"))  # minutes
