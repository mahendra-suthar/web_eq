from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import DATABASE_URL, DB_HOST, DB_NAME, DB_PORT, DB_USER, DB_PASSWORD, DB_ECHO_LOGS

load_dotenv()

class DatabaseSettings(BaseSettings):
    DB_USER: str = DB_USER
    DB_PASSWORD: str = DB_PASSWORD
    DB_HOST: str = DB_HOST
    DB_PORT: str = DB_PORT
    DB_NAME: str = DB_NAME
    DB_ECHO_LOGS: bool = DB_ECHO_LOGS

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


# Use the settings
db_settings = DatabaseSettings()
db_url = DATABASE_URL or db_settings.DATABASE_URL
# Render may provide postgres://; SQLAlchemy expects postgresql://
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    db_url,
    echo=db_settings.DB_ECHO_LOGS,
    pool_pre_ping=True,
    pool_size=5,       # Render Starter DB allows 25 connections max; keep headroom
    max_overflow=10,   # 15 total — leaves room for migrations and admin queries
    pool_timeout=30,
    pool_recycle=1800, # Recycle connections every 30 min to avoid stale connections
)

# Define the Base class
Base = declarative_base()

# Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency to get the database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
