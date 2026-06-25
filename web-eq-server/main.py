import os
import logging
import uvicorn
from contextlib import asynccontextmanager
from datetime import date
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.exc import IntegrityError

from app.routers.routers import routers
from app.db.database import engine, Base, SessionLocal
from app.middleware.auth_middleware import AuthMiddleware
from app.services.queue_service import QueueService
from app.controllers.queue_controller import QueueController
from app.core.config import CORS_ORIGINS
from app.core.utils import today_app_date, current_time_app_tz
from app.core.constants import QUEUE_USER_SCHEDULED, APPOINTMENT_TYPE_FIXED, APPOINTMENT_TYPE_APPROXIMATE

# Import all models to ensure they're registered with SQLAlchemy
from app.models import (
    User, UserLogin, Business, Category,
    Address, Schedule, ScheduleBreak, ScheduleException, Employee, Service,
    Queue, QueueUser, QueueService as QueueServiceModel, QueueUserService, AppointmentSlot,
    Role, UserRoles, Review, ContactForm,
)  # noqa: F401

# Create the database schema
Base.metadata.create_all(bind=engine)

logger = logging.getLogger(__name__)


def run_schema_upgrades() -> None:
    """Idempotent additive schema tweaks that create_all can't apply to existing
    tables (it only creates missing tables). Safe to run on every startup."""
    from sqlalchemy import text
    statements = [
        "ALTER TABLE schedule_exceptions ADD COLUMN IF NOT EXISTS leave_group_id UUID",
        "CREATE INDEX IF NOT EXISTS ix_schedule_exceptions_leave_group_id "
        "ON schedule_exceptions (leave_group_id)",
    ]
    db = SessionLocal()
    try:
        for stmt in statements:
            db.execute(text(stmt))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Schema upgrade job failed")
    finally:
        db.close()


def run_migration_job() -> None:
    """One-time startup migration: convert existing Fixed/Approximate REGISTERED appointments to SCHEDULED.
    Idempotent — safe to run on every startup."""
    db = SessionLocal()
    try:
        from app.models.queue import QueueUser
        today = today_app_date()
        updated = (
            db.query(QueueUser)
            .filter(
                QueueUser.status == 1,  # QUEUE_USER_REGISTERED — avoid circular import at module level
                QueueUser.appointment_type.in_([APPOINTMENT_TYPE_FIXED, APPOINTMENT_TYPE_APPROXIMATE]),
                QueueUser.queue_date >= today,
            )
            .update({QueueUser.status: QUEUE_USER_SCHEDULED}, synchronize_session=False)
        )
        db.commit()
        if updated:
            logger.info("Migration: converted %d Fixed/Approximate appointments to SCHEDULED", updated)
    except Exception:
        db.rollback()
        logger.exception("Migration job failed")
    finally:
        db.close()


def run_expiry_job() -> None:
    db = SessionLocal()
    try:
        today = today_app_date()
        updated = QueueService(db).expire_past_day_appointments(today)
        if updated:
            logger.info("Expiry job: marked %d appointment(s) as expired (before %s)", updated, today)
    except Exception:
        logger.exception("Expiry job failed")
    finally:
        db.close()


def run_activate_scheduled_job() -> None:
    db = SessionLocal()
    try:
        today = today_app_date()
        now_time = current_time_app_tz()
        updated = QueueService(db).activate_due_scheduled_appointments(today, now_time)
        if updated:
            logger.info("Activate job: started %d scheduled appointment(s) at %s", updated, now_time)
    except Exception:
        logger.exception("Activate scheduled appointments job failed")
    finally:
        db.close()


def run_eta_notification_job() -> None:
    """Every minute: send 'Time to Head Out!' push when wait <= customer's eta_minutes."""
    db = SessionLocal()
    try:
        controller = QueueController(db)
        eta_notified = controller.check_and_notify_eta()
        if eta_notified:
            logger.info("ETA notification job: sent %d heading-now notification(s)", eta_notified)
    except Exception:
        logger.exception("ETA notification job failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_schema_upgrades()
    run_migration_job()
    run_expiry_job()
    run_activate_scheduled_job()
    scheduler = BackgroundScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(run_expiry_job, "cron", hour=0, minute=5, id="expire_appointments")
    scheduler.add_job(run_activate_scheduled_job, "interval", minutes=1, id="activate_scheduled")
    scheduler.add_job(run_eta_notification_job, "interval", minutes=1, id="eta_notification")
    scheduler.start()
    logger.info("APScheduler started: expiry at 00:05 IST, activate-scheduled every 1 min, ETA notification every 1 min")
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
    "http://localhost:8080",
    "http://127.0.0.1:8080",
]

if CORS_ORIGINS:
    origins.extend([o.strip() for o in CORS_ORIGINS.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)
app.include_router(routers, prefix="/api")


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("IntegrityError on %s: %s", request.url.path, exc.orig)
    orig = str(exc.orig).lower()
    if "email" in orig:
        msg = "This email is already registered to another account."
    elif "phone" in orig:
        msg = "This phone number is already registered to another account."
    else:
        msg = "A record with this information already exists."
    return JSONResponse(
        status_code=409,
        content={"detail": {"message": msg}},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": {"message": "An unexpected error occurred. Please try again."}},
    )

@app.get("/healthz")
def healthz():
    return {"status": "ok"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
