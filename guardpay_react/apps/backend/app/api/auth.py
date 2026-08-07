import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..schemas import PinDisable, PinLogin, PinSet
from ..services.auth import (
    get_or_create_auth,
    hash_pin,
    load_auth,
    make_session_token,
    rotate_session_secret,
    verify_pin,
    verify_session_token,
)
from ..services.backups import maybe_backup_before_change

router = APIRouter(prefix="/api/auth", tags=["auth"])
SESSION_COOKIE = "guardpay_session"

# PIN login throttle: per-client-IP attempt limiter with exponential backoff.
# PIN space is tiny (~10k combos), so brute force must be slowed, while keeping
# the threshold high enough that a genuine user never self-locks.
_LOGIN_MAX_FAILS = 10
_LOGIN_WINDOW = 600.0  # seconds over which failures are counted
_LOGIN_BACKOFF = 60.0  # base seconds for the first lockout
_log_failures: dict[str, list[float]] = {}


def _login_block(request: Request) -> int:
    """Return the remaining lockout seconds for this client IP (0 = allowed)."""
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    fails = [t for t in _log_failures.get(ip, []) if now - t <= _LOGIN_WINDOW]
    if len(fails) < _LOGIN_MAX_FAILS:
        _log_failures[ip] = fails
        return 0
    # exponential backoff: every block lengthens by a factor of two
    wait = _LOGIN_BACKOFF * (2 ** ((len(fails) - _LOGIN_MAX_FAILS) // _LOGIN_MAX_FAILS))
    elapsed = now - fails[-1]
    if elapsed >= wait:
        return 0
    return int(wait - elapsed)


def _login_ok(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    _log_failures.pop(ip, None)


def _login_fail(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    _log_failures.setdefault(ip, []).append(time.monotonic())


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


async def require_auth(request: Request, session: AsyncSession = Depends(get_db)):
    """FastAPI dependency guarding app routes when a device PIN is enabled.

    When no PIN is configured the API stays open (legacy behaviour). Once a PIN
    is set, every non-auth, non-public request must carry a valid session
    cookie issued by POST /api/auth/login.
    """
    auth = await load_auth(session)
    if not auth.pin_enabled:
        return
    token = request.cookies.get(SESSION_COOKIE)
    if not token or not verify_session_token(token, auth.session_secret):
        raise HTTPException(401, "Session expired or not authenticated")


@router.get("/status")
async def auth_status(request: Request, session: AsyncSession = Depends(get_db)):
    auth = await load_auth(session)
    if not auth.pin_enabled:
        return {"pin_enabled": False, "authenticated": True}
    token = request.cookies.get(SESSION_COOKIE)
    authenticated = bool(token) and verify_session_token(token, auth.session_secret)
    return {"pin_enabled": True, "authenticated": authenticated}


@router.post("/login")
async def login(data: PinLogin, request: Request, response: Response, session: AsyncSession = Depends(get_db)):
    lock = _login_block(request)
    if lock > 0:
        raise HTTPException(429, f"Too many failed attempts. Try again in {lock} seconds.")
    auth = await load_auth(session)
    if not auth.pin_enabled or not auth.pin_hash or not auth.pin_salt:
        _login_ok(request)
        return {"ok": True, "note": "no pin required"}
    if not verify_pin(data.pin, auth.pin_salt, auth.pin_hash, auth.iterations):
        _login_fail(request)
        raise HTTPException(401, "Incorrect PIN")
    _login_ok(request)
    token = make_session_token(auth.session_secret)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.post("/set-pin")
async def set_pin(data: PinSet, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("pin-set")
    auth = await get_or_create_auth(session)
    if auth.pin_enabled:
        # require current pin to change
        if not data.current_pin or not verify_pin(data.current_pin, auth.pin_salt, auth.pin_hash, auth.iterations):
            raise HTTPException(403, "Current PIN required to change")
    salt = secrets.token_hex(16)
    auth.pin_salt = salt
    auth.pin_hash = hash_pin(data.pin, salt, auth.iterations)
    auth.pin_enabled = True
    auth.updated_at = _ts()
    # invalidate all sessions on pin change
    await rotate_session_secret(session)
    return {"ok": True}


@router.post("/disable")
async def disable_pin(data: PinDisable, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("pin-disable")
    auth = await get_or_create_auth(session)
    if auth.pin_enabled:
        cur = data.current_pin
        if not cur or not verify_pin(cur, auth.pin_salt, auth.pin_hash, auth.iterations):
            raise HTTPException(403, "Current PIN required")
    auth.pin_enabled = False
    auth.pin_hash = None
    auth.pin_salt = None
    auth.updated_at = _ts()
    await rotate_session_secret(session)
    return {"ok": True}