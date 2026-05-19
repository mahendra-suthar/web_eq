import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape

from sqlalchemy.orm import Session

from app.models.contact import ContactForm

logger = logging.getLogger(__name__)

_RATE_LIMIT_MAX = 3
_RATE_LIMIT_WINDOW = 3600  # seconds


class ContactFormService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def save(
        self,
        full_name: str,
        email: str,
        phone: str | None,
        country_code: str | None,
        message: str,
        ip_address: str | None,
    ) -> ContactForm:
        submission = ContactForm(
            full_name=full_name,
            email=email,
            phone=phone,
            country_code=country_code,
            message=message,
            ip_address=ip_address,
        )
        self.db.add(submission)
        self.db.commit()
        self.db.refresh(submission)
        logger.info("Contact form saved (uuid=%s ip=%s)", submission.uuid, ip_address)
        return submission

    def send_email(self, full_name: str, email: str, phone: str | None, message: str) -> None:
        """Send notification email to the team. Failures are logged, never raised."""
        from app.core.config import (
            SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
            CONTACT_RECIPIENT_EMAIL,
        )
        if not all([SMTP_HOST, SMTP_USER, SMTP_PASSWORD, CONTACT_RECIPIENT_EMAIL]):
            logger.warning("SMTP not configured — skipping contact form email notification")
            return
        try:
            phone_display = phone or "Not provided"
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"New Contact Form Message from {full_name}"
            msg["From"] = SMTP_FROM or SMTP_USER
            msg["To"] = CONTACT_RECIPIENT_EMAIL

            plain = (
                f"Name: {full_name}\n"
                f"Email: {email}\n"
                f"Phone: {phone_display}\n\n"
                f"Message:\n{message}"
            )
            html = f"""<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#091C1A;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#2A9D8F;margin-bottom:16px">New Contact Form Submission</h2>
  <table style="border-collapse:collapse;width:100%;margin-bottom:20px">
    <tr><td style="padding:6px 12px 6px 0;font-weight:600;white-space:nowrap">Name</td>
        <td style="padding:6px 0">{escape(full_name)}</td></tr>
    <tr><td style="padding:6px 12px 6px 0;font-weight:600">Email</td>
        <td style="padding:6px 0"><a href="mailto:{escape(email)}" style="color:#2A9D8F">{escape(email)}</a></td></tr>
    <tr><td style="padding:6px 12px 6px 0;font-weight:600">Phone</td>
        <td style="padding:6px 0">{escape(phone_display)}</td></tr>
  </table>
  <h3 style="margin-bottom:8px">Message</h3>
  <p style="line-height:1.65;white-space:pre-wrap;background:#F5FCFB;border-left:3px solid #2A9D8F;padding:12px 16px;border-radius:4px">{escape(message)}</p>
  <p style="color:#8BB8B3;font-size:12px;margin-top:24px">Sent via EaseQueue contact form</p>
</body></html>"""

            msg.attach(MIMEText(plain, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(SMTP_HOST, int(SMTP_PORT)) as server:
                server.ehlo()
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(msg["From"], CONTACT_RECIPIENT_EMAIL, msg.as_string())

            logger.info("Contact form email sent for %s <%s>", full_name, email)
        except Exception:
            logger.exception("Failed to send contact form email (name=%s email=%s)", full_name, email)


async def check_rate_limit(ip_address: str) -> bool:
    """
    Returns True if the request is within the rate limit, False if exceeded.
    Fails open: if Redis is unavailable the request is allowed through.
    """
    try:
        from redis.asyncio import from_url as redis_from_url
        from app.core.config import REDIS_URL

        async with redis_from_url(REDIS_URL, decode_responses=True) as client:
            key = f"contact_form_rl:{ip_address}"
            count = await client.incr(key)
            if count == 1:
                await client.expire(key, _RATE_LIMIT_WINDOW)
            return count <= _RATE_LIMIT_MAX
    except Exception:
        logger.warning("Redis rate-limit check failed — allowing request (ip=%s)", ip_address, exc_info=True)
        return True
