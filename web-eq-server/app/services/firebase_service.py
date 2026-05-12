import logging
import httpx
from cryptography.x509 import load_pem_x509_certificate
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from jose import jwt, JWTError

from app.core.config import FIREBASE_PROJECT_ID

logger = logging.getLogger(__name__)

_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
_pubkey_cache: dict[str, str] = {}  # kid → RSA public key PEM


async def _fetch_public_keys() -> dict[str, str]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_CERTS_URL)
        resp.raise_for_status()
        certs: dict[str, str] = resp.json()
    keys: dict[str, str] = {}
    for kid, cert_pem in certs.items():
        cert = load_pem_x509_certificate(cert_pem.encode())
        keys[kid] = cert.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
    return keys


async def verify_firebase_id_token(id_token: str) -> dict:
    """
    Verify a Firebase Phone Auth ID token and return its decoded claims.
    Raises ValueError on any verification failure.
    Fetches and caches Google's public keys; re-fetches automatically on key rotation.
    """
    global _pubkey_cache

    if not FIREBASE_PROJECT_ID:
        raise ValueError("FIREBASE_PROJECT_ID is not configured")

    try:
        header = jwt.get_unverified_header(id_token)
    except JWTError as exc:
        raise ValueError(f"Malformed token: {exc}") from exc

    kid = header.get("kid")

    if not _pubkey_cache or kid not in _pubkey_cache:
        _pubkey_cache = await _fetch_public_keys()

    if kid not in _pubkey_cache:
        # Key may have just rotated — clear cache and try once more
        _pubkey_cache = {}
        _pubkey_cache = await _fetch_public_keys()

    if kid not in _pubkey_cache:
        raise ValueError("Unknown key ID in Firebase token")

    try:
        claims = jwt.decode(
            id_token,
            _pubkey_cache[kid],
            algorithms=["RS256"],
            audience=FIREBASE_PROJECT_ID,
            issuer=f"https://securetoken.google.com/{FIREBASE_PROJECT_ID}",
        )
    except JWTError as exc:
        raise ValueError(f"Token verification failed: {exc}") from exc

    if not claims.get("phone_number"):
        raise ValueError("No phone number in Firebase token")

    return claims
