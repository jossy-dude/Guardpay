import base64
import hashlib
import hmac
import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuthSecret

# Session token: HMAC-SHA256 over payload with the stored secret.
# Cookie carries "payload.signature"; payload = base64("session|created_ts").


def _timestamp() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def get_or_create_auth(session: AsyncSession) -> AuthSecret:
    auth = await session.get(AuthSecret, 1)
    if auth is None:
        auth = AuthSecret(id=1, pin_enabled=False, session_secret=secrets.token_hex(32))
        session.add(auth)
        await session.commit()
    return auth


def hash_pin(pin: str, salt: str, iterations: int = 200_000) -> str:
    return hashlib.pbkdf2_hmac("sha256", pin.encode(), salt.encode(), iterations).hex()


def verify_pin(pin: str, salt: str, expected: str, iterations: int) -> bool:
    computed = hash_pin(pin, salt, iterations)
    return hmac.compare_digest(computed, expected)


def make_session_token(secret: str) -> str:
    payload = base64.urlsafe_b64encode(f"session|{_timestamp()}".encode()).decode()
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def verify_session_token(token: str | None, secret: str) -> bool:
    if not token or "." not in token:
        return False
    payload, sig = token.rsplit(".", 1)
    expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        raw = base64.urlsafe_b64decode(payload.encode()).decode()
        _, ts = raw.split("|", 1)
    except Exception:
        return False
    from datetime import datetime, timezone

    try:
        created = datetime.fromisoformat(ts)
        age = (datetime.now(timezone.utc) - created).total_seconds()
    except Exception:
        return False
    from ..core.config import SESSION_MAX_AGE

    return age <= SESSION_MAX_AGE


async def rotate_session_secret(session: AsyncSession) -> str:
    """Invalidate all existing sessions after a PIN change."""
    auth = await get_or_create_auth(session)
    auth.session_secret = secrets.token_hex(32)
    await session.commit()
    return auth.session_secret


async def load_auth(session: AsyncSession) -> AuthSecret:
    result = await session.execute(select(AuthSecret).where(AuthSecret.id == 1))
    auth = result.scalar_one_or_none()
    if auth is None:
        auth = AuthSecret(id=1, pin_enabled=False, session_secret=secrets.token_hex(32))
        session.add(auth)
        await session.commit()
    return auth