from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import DEFAULT_SETTINGS, KNOWN_SETTINGS
from ..core.database import get_db
from ..models import Setting
from ..schemas import SettingsUpdate
from ..services.backups import maybe_backup_before_change

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@router.get("")
async def get_settings(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Setting))
    stored = {s.key: s.value for s in result.scalars()}
    merged = {**DEFAULT_SETTINGS, **stored}

    def _int(key: str, default: str) -> int:
        try:
            return int(merged.get(key, default))
        except (TypeError, ValueError):
            return int(default)

    return {
        "neighborhood_name": merged.get("neighborhood_name", "Neighborhood Watch"),
        "currency": merged.get("currency", "ETB"),
        "due_day": _int("due_day", "5"),
        "guard_name": merged.get("guard_name", "Night Watch Guard"),
        "guard_salary": _int("guard_salary", "30000"),
        "backup_before_changes": merged.get("backup_before_changes", "0") == "1",
        "default_fee": _int("default_fee", "4000"),
        "guard_account_suffix": merged.get("guard_account_suffix", ""),
        "calendar_mode": merged.get("calendar_mode", "gregorian"),
        "month_language": merged.get("month_language", "english"),
    }


@router.post("")
async def update_settings(data: SettingsUpdate, session: AsyncSession = Depends(get_db)):
    await maybe_backup_before_change("settings-update")
    updates = data.model_dump(exclude_none=True)
    ts = _ts()
    for key, value in updates.items():
        if key not in KNOWN_SETTINGS:
            continue
        display = "1" if isinstance(value, bool) and value else "0" if isinstance(value, bool) else str(value)
        row = await session.get(Setting, key)
        if row:
            row.value = display
            row.updated_at = ts
        else:
            session.add(Setting(key=key, value=display, updated_at=ts))
    await session.commit()
    return {"ok": True}