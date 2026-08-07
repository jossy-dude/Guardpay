from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import Household, HouseAlias, HouseReminder
from ..schemas import AliasAdd, AliasDelete, ReminderCreate, ReminderResolve
from ..services.backups import maybe_backup_before_change

router = APIRouter(prefix="/api", tags=["extras"])


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------- Reminders ----------------
@router.get("/reminders")
async def list_reminders(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(HouseReminder, Household)
        .join(Household, HouseReminder.house_id == Household.id)
        .where(HouseReminder.is_active == True, Household.active == True)
        .order_by(HouseReminder.created_at.desc())
    )
    return [
        {
            "id": r.id,
            "house_id": r.house_id,
            "house_name": h.name,
            "house_number": h.house_number,
            "is_active": r.is_active,
            "note": r.note,
            "created_at": r.created_at,
            "reminded_at": r.reminded_at,
        }
        for r, h in result.all()
    ]


@router.post("/reminders/add")
async def add_reminder(data: ReminderCreate, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("reminder-add")
    house = await session.get(Household, data.house_id)
    if not house:
        raise HTTPException(404, "House not found")
    ts = _ts()
    existing = await session.execute(
        select(HouseReminder).where(HouseReminder.house_id == data.house_id, HouseReminder.is_active == True)
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "note": "already active"}
    session.add(HouseReminder(house_id=data.house_id, note=data.note, created_at=ts))
    try:
        await session.commit()
    except IntegrityError:
        # concurrent add raced us — one active reminder per house (unique index)
        await session.rollback()
        return {"ok": True, "note": "already active"}
    return {"ok": True}


@router.post("/reminders/resolve")
async def resolve_reminder(data: ReminderResolve, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("reminder-resolve")
    r = await session.get(HouseReminder, data.id)
    if not r:
        raise HTTPException(404, "Reminder not found")
    r.is_active = False
    r.reminded_at = _ts()
    await session.commit()
    return {"ok": True}


@router.post("/reminders/clear-all")
async def clear_all_reminders(session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("reminders-clear")
    result = await session.execute(select(HouseReminder).where(HouseReminder.is_active == True))
    for r in result.scalars():
        r.is_active = False
        r.reminded_at = _ts()
    await session.commit()
    return {"ok": True}


# ---------------- Aliases ----------------
@router.get("/aliases")
async def list_aliases(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(HouseAlias))
    return [{"id": a.id, "house_id": a.house_id, "alias": a.alias, "created_at": a.created_at} for a in result.scalars()]


@router.post("/aliases/add")
async def add_alias(data: AliasAdd, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("alias-add")
    alias = data.alias.strip()
    session.add(HouseAlias(house_id=data.house_id, alias=alias, created_at=_ts()))
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Alias already exists")
    return {"ok": True}


@router.post("/aliases/delete")
async def delete_alias(data: AliasDelete, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("alias-delete")
    a = await session.get(HouseAlias, data.id)
    if not a:
        raise HTTPException(404, "Alias not found")
    await session.delete(a)
    await session.commit()
    return {"ok": True}


# ---------------- Resident self-service (no auth) ----------------
# Split into its own router so the protected `/api/*` router dependency never
# gates the public lookup/status endpoints used by the resident self-service.
public_router = APIRouter(prefix="/api", tags=["public"])


@public_router.get("/public/house/{code}")
async def public_lookup(code: str, session: AsyncSession = Depends(get_db)):
    """Resident lookup by access code. Only reveals the matching household."""
    from datetime import datetime

    from ..models import Payment

    code = code.strip().lower()
    if len(code) < 4 or len(code) > 16:
        raise HTTPException(400, "Invalid code")
    # access code = deterministic hash of house_number, matching frontend derivation
    import hashlib

    houses = (await session.execute(select(Household).where(Household.active == True))).scalars().all()
    target = None
    for h in houses:
        digest = hashlib.sha256(h.house_number.encode()).hexdigest()
        if digest[:8].lower() == code or digest[:6].lower() == code:
            target = h
            break
    if target is None:
        raise HTTPException(404, "Code not found")
    now = datetime.now()
    current_month = f"{now.year}-{now.month:02d}"
    paid = (
        await session.execute(
            select(Payment.id).where(Payment.house_id == target.id, Payment.month_key == current_month)
        )
    ).scalar_one_or_none()
    return {
        "house_id": target.id,
        "name": target.name,
        "house_number": target.house_number,
        "fee": target.fee,
        "monthly_status": "paid" if paid else "unpaid",
    }


@public_router.get("/public/status/{house_id}")
async def public_status(house_id: int, access_code: str = "", session: AsyncSession = Depends(get_db)):
    """Read-only aggregate status for one household (used by the self-service page).

    Requires the household's access code (query param `access_code`, sha256 of the
    house_number like `public_lookup`) so `/public/status/1..N` can't be enumerated.
    Returns only a privacy-safe month-status summary — no raw payment notes.
    """
    import hashlib

    from ..services.scoring import compute_reliability

    house = await session.get(Household, house_id)
    if not house or not house.active:
        raise HTTPException(404, "House not found")

    code = access_code.strip().lower()
    if len(code) < 4 or len(code) > 16:
        raise HTTPException(403, "Access code required")
    digest = hashlib.sha256(house.house_number.encode()).hexdigest()
    if not (code == digest[:8] or code == digest[:6]):
        raise HTTPException(403, "Invalid access code")

    from ..models import Payment
    from ..api.settings import get_settings

    payments = (await session.execute(select(Payment).where(Payment.house_id == house_id))).scalars().all()
    settings = await get_settings(session)
    stats = compute_reliability(
        house.created_month,
        [
            {"month_key": p.month_key, "paid_date": p.paid_date, "amount": p.amount}
            for p in payments
        ],
        settings["due_day"],
    )
    return {
        "name": house.name,
        "house_number": house.house_number,
        "fee": house.fee,
        "current_streak": stats["current_streak"],
        "on_time_rate": stats["on_time_rate"],
        "reliability_score": stats["reliability_score"],
        "tier": stats["tier"],
        "history": stats["history"],
    }