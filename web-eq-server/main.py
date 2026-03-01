import os
import logging
import uvicorn
from contextlib import asynccontextmanager
from datetime import date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.routers.routers import routers
from app.db.database import engine, Base, SessionLocal
from app.middleware.auth_middleware import AuthMiddleware
from app.services.queue_service import QueueService

# Import all models to ensure they're registered with SQLAlchemy
from app.models import (
    User, UserLogin, Business, Category,
    Address, Schedule, ScheduleBreak, ScheduleException, Employee, Service,
    Queue, QueueUser, QueueService as QueueServiceModel, QueueUserService,
    Role, UserRoles, Review
)  # noqa: F401

# Create the database schema
Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)


def run_expiry_job() -> None:
    db = SessionLocal()
    try:
        today = date.today()
        updated = QueueService(db).expire_past_day_appointments(today)
        if updated:
            logger.info("Expiry job: marked %d appointment(s) as expired (before %s)", updated, today)
    except Exception:
        logger.exception("Expiry job failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_expiry_job()
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(run_expiry_job, "cron", hour=0, minute=5, id="expire_appointments")
    scheduler.start()
    logger.info("APScheduler started: daily expiry job at 00:05 IST")
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler shut down")


app = FastAPI(
    title="Web EQ API",
    description="Web EQ Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)
app.include_router(routers, prefix="/api")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
