from sqlalchemy.orm import Session
from datetime import datetime

from app.models.auth import UserLogin


class OTPService:
    def __init__(self, db: Session):
        self.db = db

    def get_recent_otp_attempts(self, country_code: str, phone_number: str, since: datetime) -> int:
        return (
            self.db.query(UserLogin)
            .filter(UserLogin.country_code == country_code)
            .filter(UserLogin.phone_number == phone_number)
            .filter(UserLogin.expires_at >= since)
            .count()
        )

    def create_otp_entry(self, country_code: str, phone_number: str, otp_hash: str, expires_at: datetime, attempts: int, status: int) -> UserLogin:
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

    def get_latest_otp(self, country_code: str, phone_number: str) -> UserLogin:
        return (
            self.db.query(UserLogin)
            .filter(UserLogin.country_code == country_code)
            .filter(UserLogin.phone_number == phone_number)
            .filter(UserLogin.status == 1)
            .order_by(UserLogin.expires_at.desc())
            .first()
        )

    def mark_otp_used(self, otp_record: UserLogin) -> None:
        otp_record.status = 2
        self.db.commit()
