from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..models import HouseAlias, Household, Payment
from ..schemas import BulkAdd, HouseCreate, HouseIdRequest, HouseImport, HouseUpdate, PaymentToggle
from ..services.audit import write_audit
from ..services.backups import maybe_backup_before_change

router = APIRouter(prefix="/api/houses", tags=["houses"])


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@router.get("")
async def list_houses(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Household).order_by(Household.house_number))
    return [
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
            "opening_balance": h.opening_balance,
        }
        for h in result.scalars()
    ]


@router.post("")
async def create_house(data: HouseCreate, session: AsyncSession = Depends(get_db)):
    today = datetime.now(timezone.utc)
    ts = _ts()
    house = Household(
        name=data.name.strip(),
        house_number=data.house_number.strip(),
        fee=data.fee,
        notes=data.notes,
        avatar=data.avatar,
        active=True,
        created_month=f"{today.year}-{today.month:02d}",
        created_at=ts,
        updated_at=ts,
    )
    session.add(house)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "House number already exists")
    await session.refresh(house)
    await write_audit(session, "CREATE", "houses", house.id, after={"name": house.name, "house_number": house.house_number, "fee": house.fee})
    return {"ok": True, "id": house.id}


@router.post("/bulk")
async def bulk_add(data: BulkAdd, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("bulk-add")
    ts = _ts()
    today = datetime.now(timezone.utc)
    added = 0
    errors = []
    for line in data.lines:
        line = line.strip()
        if not line:
            continue
        # Parse "131 Lensa Bekele", "132 - Dawit", "133, Hana", "134;Ali"
        import re

        m = re.match(r"^\s*([^\s,\-;]+)\s*[,;\-]?\s+(.+)$", line)
        if not m:
            errors.append(f"Couldn't parse: {line}")
            continue
        number, name = m.group(1), m.group(2).strip()
        existing = await session.execute(select(Household).where(Household.house_number == number))
        if existing.scalar_one_or_none():
            errors.append(f"Duplicate house: {number}")
            continue
        house = Household(
            name=name,
            house_number=number,
            fee=data.default_fee,
            active=True,
            created_month=f"{today.year}-{today.month:02d}",
            created_at=ts,
            updated_at=ts,
        )
        session.add(house)
        added += 1
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Bulk add aborted — a house number already exists")
    return {"ok": True, "added": added, "errors": errors}


# Ethiopian month names (index 0 = Meskerem) — matches the frontend calendar layer.
_ETH_MONTHS = [
    "meskerem", "tikimt", "hidar", "tahsas", "tir", "yekatit", "megabit",
    "miyazya", "ginbot", "sene", "hamle", "nehasse", "pagume",
]
_GREG_MONTHS = [
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
]


def _jdn_gregorian(y: int, m: int, d: int) -> int:
    a = (14 - m) // 12
    yy = y + 4800 - a
    mm = m + 12 * a - 3
    return d + (153 * mm + 2) // 5 + 365 * yy + yy // 4 - yy // 100 + yy // 400 - 32045


def _jdn_ethiopian(y: int, m: int, d: int) -> int:
    return 1724220 + 365 * (y - 1) + y // 4 + 30 * (m - 1) + d


def _jdn_to_gregorian(jdn: int) -> tuple[int, int, int]:
    a = jdn + 32044
    b = (4 * a + 3) // 146097
    c = a - (146097 * b) // 4
    d = (4 * c + 3) // 1461
    e = c - (1461 * d) // 4
    mm = (5 * e + 2) // 153
    day = e - (153 * mm + 2) // 5 + 1
    month = mm + 3 - 12 * (mm // 10)
    year = 100 * b + d - 4800 + mm // 10
    return year, month, day


def _jdn_to_ethiopian(jdn: int) -> tuple[int, int, int]:
    x = jdn - 1724220
    year = (4 * x - 1) // 1461 + 1
    offset = x - (365 * (year - 1) + year // 4 + 1)
    return year, offset // 30 + 1, (offset % 30) + 1


def _parse_month_label(label: str, calendar_mode: str) -> str | None:
    """Turn a month label (YYYY-MM, 'March 2025', or an Ethiopian month name)
    into a canonical Gregorian YYYY-MM key. Returns None if unparsable."""
    import re

    s = label.strip()
    if re.fullmatch(r"\d{4}-\d{2}", s):
        y, mo = int(s[:4]), int(s[5:7])
        if 1970 <= y <= 2100 and 1 <= mo <= 12:
            return s
        return None
    m = re.fullmatch(r"(\d{1,2})/(\d{4})", s)
    if m:
        mo, ye = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12 and 1970 <= ye <= 2100:
            return f"{ye:04d}-{mo:02d}"
    m = re.match(r"([A-Za-z]+)\s+(\d{4})", s)
    if m:
        name, ye = m.group(1).strip().lower(), int(m.group(2))
        if 1970 <= ye <= 2100:
            if name in _GREG_MONTHS:
                mo = _GREG_MONTHS.index(name) + 1
                return f"{ye:04d}-{mo:02d}"
            if name in _ETH_MONTHS:
                em = _ETH_MONTHS.index(name) + 1
                # Pagume is 5-6 days long; clamp the anchor day so it never
                # overflows. Keep the same day-15 anchor as the frontend so an
                # Ethiopian month maps to the same Gregorian month in both.
                anchor_day = 15 if em < 13 else 5
                gy, gm, _ = _jdn_to_gregorian(_jdn_ethiopian(ye, em, anchor_day))
                return f"{gy:04d}-{gm:02d}"
    return None


@router.post("/import")
async def import_houses(data: HouseImport, session: AsyncSession = Depends(get_db)):
    """Excel/template import: households with optional aliases and paid months."""
    await maybe_backup_before_change("import")
    import calendar as _cal
    import re

    ts = _ts()
    today = datetime.now(timezone.utc)
    added = 0
    payments_added = 0
    errors = []
    existing = (await session.execute(select(Household.house_number))).scalars().all()
    existing_numbers = set(existing)

    for item in data.households:
        number = (item.house_number or "").strip()
        name = (item.name or "").strip()
        if not number or not name:
            errors.append("Row missing house number or name")
            continue
        if number in existing_numbers:
            errors.append(f"Duplicate house: {number}")
            continue
        fee = item.fee if item.fee is not None else data.default_fee
        notes = ""
        if item.paid_day is not None:
            notes = f"paid_day:{item.paid_day}"
        house = Household(
            name=name,
            house_number=number,
            fee=fee,
            notes=notes,
            active=True,
            created_month=f"{today.year}-{today.month:02d}",
            created_at=ts,
            updated_at=ts,
            opening_balance=item.opening_balance or 0,
        )
        session.add(house)
        await session.flush()
        existing_numbers.add(number)
        added += 1

        seen_aliases = set()
        for alias in item.aliases:
            a = (alias or "").strip()
            if not a or a in seen_aliases:
                continue
            seen_aliases.add(a)
            session.add(HouseAlias(house_id=house.id, alias=a, created_at=ts))

        seen_months = set()
        month_items: list[tuple[str, int | None, str]] = [
            (label, None, "") for label in item.months
        ]
        for p in item.payments:
            month_items.append((p.month, p.amount, (p.note or "").strip()))
        for label, amount, note in month_items:
            key = _parse_month_label(label, data.calendar_mode)
            if not key:
                errors.append(f"Bad month for {number}: {label}")
                continue
            if key in seen_months:
                errors.append(f"Duplicate month for {number}: {key}")
                continue
            seen_months.add(key)
            # house was just created — no payment rows can exist yet, so the
            # existence check is skipped (avoids an N+1 query per month)
            y, m = int(key[:4]), int(key[5:7])
            day = max(1, min(item.paid_day or 5, _cal.monthrange(y, m)[1]))
            session.add(
                Payment(
                    house_id=house.id,
                    month_key=key,
                    paid_date=f"{key}-{day:02d}",
                    amount=amount if amount is not None else fee,
                    note=note if note else "imported",
                    source="import",
                    created_at=ts,
                    updated_at=ts,
                )
            )
            payments_added += 1

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Import aborted — a duplicate house number or alias caused a conflict")
    if added:
        await write_audit(session, "IMPORT", "houses", 0, after={"houses": added, "payments": payments_added})
    return {"ok": True, "added": added, "skipped": len(data.households) - added, "payments": payments_added, "errors": errors}


@router.put("/update")
async def update_house(data: HouseUpdate, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("house-update")
    house = await session.get(Household, data.id)
    if not house:
        raise HTTPException(404, "House not found")
    ts = _ts()
    fields = data.model_fields_set
    old_fee = house.fee
    # fee audit is driven only by the *supplied* fee, so an edit that omits the
    # fee never logs a spurious change against a None/previous default.
    fee_changed = "fee" in fields and old_fee != data.fee

    if "active" in fields:
        was_active = house.active
        house.active = data.active
        if data.active and not was_active:
            house.deleted_at = None
        elif not data.active and was_active:
            house.deleted_at = ts
    if "name" in fields:
        house.name = data.name
    if "house_number" in fields:
        house.house_number = data.house_number
    if "fee" in fields:
        house.fee = data.fee
    if "notes" in fields:
        house.notes = data.notes
    if "avatar" in fields:
        house.avatar = data.avatar
    if "deleted_at" in fields:
        house.deleted_at = data.deleted_at
    if "opening_balance" in fields:
        house.opening_balance = data.opening_balance
    house.updated_at = ts
    try:
        if fee_changed:
            from ..models import FeeChange

            session.add(FeeChange(house_id=house.id, old_fee=old_fee, new_fee=data.fee, changed_at=ts, note="fee updated"))
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "House number already exists")
    await write_audit(session, "UPDATE", "houses", house.id, after={"name": house.name, "house_number": house.house_number, "fee": house.fee, "active": house.active})
    return {"ok": True}


@router.post("/delete")
async def delete_house(data: HouseIdRequest, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("house-delete")
    house = await session.get(Household, data.id)
    if not house:
        raise HTTPException(404, "House not found")
    ts = _ts()
    house.active = False
    house.deleted_at = ts
    house.updated_at = ts
    await session.commit()
    await write_audit(session, "DELETE", "houses", house.id, before={"name": house.name})
    return {"ok": True}


@router.post("/restore")
async def restore_house(data: HouseIdRequest, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("house-restore")
    house = await session.get(Household, data.id)
    if not house:
        raise HTTPException(404, "House not found")
    house.active = True
    house.deleted_at = None
    house.updated_at = _ts()
    await session.commit()
    return {"ok": True}


# ---- Payments (nested under houses for convenience) ----

@router.post("/payments/toggle")
async def toggle_payment(data: PaymentToggle, session: AsyncSession = Depends(get_db)):
    """Create (paid) or delete (unpaid) a payment row for a house+month."""
    result = await session.execute(
        select(Payment).where(Payment.house_id == data.house_id, Payment.month_key == data.month_key)
    )
    payment = result.scalar_one_or_none()
    ts = _ts()
    if not data.paid:
        if payment:
            await maybe_backup_before_change("payment-delete")
            await session.delete(payment)
            await session.commit()
            await write_audit(
                session,
                "DELETE",
                "payments",
                payment.id,
                before={
                    "month": data.month_key,
                    "house_id": payment.house_id,
                    "amount": payment.amount,
                    "paid_date": payment.paid_date,
                    "note": payment.note,
                },
            )
        return {"ok": True, "paid": False}

    created = payment is None
    if created:
        await maybe_backup_before_change("payment-create")
        house = await session.get(Household, data.house_id)
        if not house:
            raise HTTPException(404, "House not found")
        payment = Payment(
            house_id=data.house_id,
            month_key=data.month_key,
            paid_date=data.date,
            amount=data.amount if data.amount is not None else house.fee,
            note=data.note,
            source="manual",
            created_at=ts,
            updated_at=ts,
        )
        session.add(payment)
    else:
        before = {
            "month": data.month_key,
            "house_id": payment.house_id,
            "amount": payment.amount,
            "paid_date": payment.paid_date,
            "note": payment.note,
        }
        payment.paid_date = data.date or payment.paid_date
        payment.amount = data.amount if data.amount is not None else payment.amount
        payment.note = data.note or payment.note
        payment.updated_at = ts
    try:
        await session.commit()
    except IntegrityError:
        if not created:
            await session.rollback()
            # non-race integrity error (e.g. bad FK / constraint) — surface cleanly
            raise HTTPException(409, "Payment could not be saved due to a conflict")
        # concurrent toggle raced us and created the same house+month row
        await session.rollback()
        result = await session.execute(
            select(Payment).where(Payment.house_id == data.house_id, Payment.month_key == data.month_key)
        )
        payment = result.scalar_one_or_none()
        if payment is None:
            raise HTTPException(409, "Payment could not be saved due to a conflict")
        await session.refresh(payment)
        return {"ok": True, "paid": True, "id": payment.id}
    await session.refresh(payment)
    await write_audit(
        session,
        "CREATE" if created else "UPDATE",
        "payments",
        payment.id,
        before=None if created else before,
        after={"month": data.month_key, "amount": payment.amount},
    )
    return {"ok": True, "paid": True, "id": payment.id}