import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import AuthSecret
from ..schemas import PinLogin, PinSet
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
async def login(data: PinLogin, response: Response, session: AsyncSession = Depends(get_db)):
    auth = await load_auth(session)
    if not auth.pin_enabled or not auth.pin_hash or not auth.pin_salt:
        return {"ok": True, "note": "no pin required"}
    if not verify_pin(data.pin, auth.pin_salt, auth.pin_hash, auth.iterations):
        raise HTTPException(401, "Incorrect PIN")
    token = make_session_token(auth.session_secret)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="strict",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    auth.last_verified_at = _ts()
    await session.commit()
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
async def disable_pin(body: dict, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("pin-disable")
    auth = await get_or_create_auth(session)
    if auth.pin_enabled:
        cur = body.get("current_pin")
        if not cur or not verify_pin(cur, auth.pin_salt, auth.pin_hash, auth.iterations):
            raise HTTPException(403, "Current PIN required")
    auth.pin_enabled = False
    auth.pin_hash = None
    auth.pin_salt = None
    auth.updated_at = _ts()
    await rotate_session_secret(session)
    return {"ok": True}