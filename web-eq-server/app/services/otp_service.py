import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime

from app.models.auth import UserLogin

logger = logging.getLogger(__name__)


class OTPService:
    def __init__(self, db: Session):
        self.db = db

    def get_recent_otp_attempts(self, country_code: str, phone_number: str, since: datetime) -> int:
        try:
            return (
                self.db.query(UserLogin)
                .filter(UserLogin.country_code == country_code)
                .filter(UserLogin.phone_number == phone_number)
                .filter(UserLogin.expires_at >= since)
                .count()
            )
        except Exception:
            logger.exception("Failed to get_recent_otp_attempts (phone=%s)", phone_number)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def create_otp_entry(self, country_code: str, phone_number: str, otp_hash: str, expires_at: datetime, attempts: int, status: int) -> UserLogin:
        try:
            new_entry = UserLogin(
                country_code=country_code,
                phone_number=phone_number,
                otp_hash=otp_hash,
                expires_at=expires_at,
                attempts=attempts,
                status=status
            )
            self.db.add(new_entry)
            self.db.commit()
            self.db.refresh(new_entry)
            return new_entry
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_otp_entry (phone=%s)", phone_number)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_latest_otp(self, country_code: str, phone_number: str) -> UserLogin:
        try:
            return (
                self.db.query(UserLogin)
                .filter(UserLogin.country_code == country_code)
                .filter(UserLogin.phone_number == phone_number)
                .filter(UserLogin.status == 1)
                .order_by(UserLogin.expires_at.desc())
                .first()
            )
        except Exception:
            logger.exception("Failed to get_latest_otp (phone=%s)", phone_number)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def mark_otp_used(self, otp_record: UserLogin) -> None:
        try:
            otp_record.status = 2  # type: ignore[assignment]
            self.db.commit()
        except Exception:
            self.db.rollback()
            logger.exception("Failed to mark_otp_used (record_id=%s)", getattr(otp_record, "uuid", None))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
