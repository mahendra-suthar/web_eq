import io

import qrcode
import qrcode.constants

from app.core.config import CUSTOMER_APP_URL


def make_png(url: str) -> bytes:
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return buf.getvalue()


def business_qr_png(business_uuid: str) -> bytes:
    """PNG bytes for a QR code linking to the business detail page."""
    return make_png(f"{CUSTOMER_APP_URL}/business/{business_uuid}")


def employee_qr_png(business_uuid: str, queue_uuid: str) -> bytes:
    """PNG bytes for a QR code linking to the booking page with queue pre-selected."""
    return make_png(f"{CUSTOMER_APP_URL}/business/{business_uuid}/book?queue={queue_uuid}")
