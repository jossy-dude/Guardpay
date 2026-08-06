from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import GuardPayment
from ..schemas import GuardCreate
from ..services.backups import maybe_backup_before_change

router = APIRouter(prefix="/api/guard", tags=["guard"])


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@router.get("/payments")
async def list_guard_payments(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(GuardPayment).order_by(GuardPayment.month_key.desc()))
    return [
        {
            "id": g.id,
            "month_key": g.month_key,
            "paid_date": g.paid_date,
            "amount": g.amount,
            "method": g.method,
            "note": g.note,
            "created_at": g.created_at,
            "updated_at": g.updated_at,
        }
        for g in result.scalars()
    ]


@router.post("/payments")
async def add_guard_payment(data: GuardCreate, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("guard-save")
    ts = _ts()
    existing = await session.execute(select(GuardPayment).where(GuardPayment.month_key == data.month_key))
    row = existing.scalar_one_or_none()
    if row:
        row.amount = data.amount
        row.paid_date = data.paid_date
        row.method = data.method
        row.note = data.note
        row.updated_at = ts
        await session.commit()
        return {"ok": True, "id": row.id, "updated": True}
    gp = GuardPayment(
        month_key=data.month_key,
        paid_date=data.paid_date,
        amount=data.amount,
        method=data.method,
        note=data.note,
        created_at=ts,
        updated_at=ts,
    )
    session.add(gp)
    try:
        await session.commit()
    except IntegrityError:
        # concurrent upsert raced us; fold into the existing row
        await session.rollback()
        existing = await session.execute(select(GuardPayment).where(GuardPayment.month_key == data.month_key))
        row = existing.scalar_one()
        row.amount = data.amount
        row.paid_date = data.paid_date
        row.method = data.method
        row.note = data.note
        row.updated_at = ts
        await session.commit()
        return {"ok": True, "id": row.id, "updated": True}
    await session.refresh(gp)
    return {"ok": True, "id": gp.id, "updated": False}


@router.post("/payments/delete")
async def delete_guard_payment(body: dict, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("guard-delete")
    gp = await session.get(GuardPayment, body.get("id"))
    if not gp:
        raise HTTPException(404, "Guard payment not found")
    await session.delete(gp)
    await session.commit()
    return {"ok": True}