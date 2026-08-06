from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import (
    FeeChange,
    GuardPayment,
    HouseAlias,
    Household,
    HouseReminder,
    Payment,
)
from ..api.settings import get_settings

router = APIRouter(prefix="/api", tags=["state"])


@router.get("/state")
async def get_state(session: AsyncSession = Depends(get_db)):
    houses = (await session.execute(select(Household))).scalars().all()
    payments = (await session.execute(select(Payment))).scalars().all()
    guard_payments = (await session.execute(select(GuardPayment))).scalars().all()
    reminders = (await session.execute(select(HouseReminder))).scalars().all()
    aliases = (await session.execute(select(HouseAlias))).scalars().all()
    fee_changes = (await session.execute(select(FeeChange))).scalars().all()
    settings = await get_settings(session)

    return {
        "houses": [
            {
                "id": h.id,
                "name": h.name,
                "house_number": h.house_number,
                "fee": h.fee,
                "notes": h.notes,
                "active": h.active,
                "created_month": h.created_month,
                "created_at": h.created_at,
                "updated_at": h.updated_at,
                "deleted_at": h.deleted_at,
                "avatar": h.avatar,
            }
            for h in houses
        ],
        "payments": [
            {
                "id": p.id,
                "house_id": p.house_id,
                "month_key": p.month_key,
                "paid_date": p.paid_date,
                "amount": p.amount,
                "note": p.note,
                "source": p.source,
                "created_at": p.created_at,
                "updated_at": p.updated_at,
            }
            for p in payments
        ],
        "guard_payments": [
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
            for g in guard_payments
        ],
        "settings": settings,
        "reminders": [
            {
                "id": r.id,
                "house_id": r.house_id,
                "is_active": r.is_active,
                "note": r.note,
                "created_at": r.created_at,
                "reminded_at": r.reminded_at,
            }
            for r in reminders
        ],
        "aliases": [
            {"id": a.id, "house_id": a.house_id, "alias": a.alias, "created_at": a.created_at} for a in aliases
        ],
        "fee_changes": [
            {
                "id": f.id,
                "house_id": f.house_id,
                "old_fee": f.old_fee,
                "new_fee": f.new_fee,
                "changed_at": f.changed_at,
                "note": f.note,
            }
            for f in fee_changes
        ],
    }