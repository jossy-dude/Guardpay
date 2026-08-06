"""Backup/snapshot helpers shared by the API and startup routines.

Provides create_snapshot (online SQLite backup via the backup API, safe with
WAL), maybe_backup_before_change (honors the `backup_before_changes` setting),
and daily_snapshot_if_needed (one auto snapshot per UTC day, mirroring the old
app). Kept here so the API router and the app lifespan share one implementation.
"""

import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from ..core.config import BACKUP_DIR, BACKUP_KEEP, DB_PATH
from ..core.database import AsyncSessionLocal


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def create_snapshot(suffix: str) -> str:
    """Create an online backup snapshot via the SQLite backup API. Returns filename."""
    src = Path(DB_PATH)
    if not src.exists():
        raise FileNotFoundError("Database file not found")
    dest = BACKUP_DIR / f"guardpay-{_stamp()}-{suffix}.db"
    scon = sqlite3.connect(src)
    dcon = sqlite3.connect(dest)
    try:
        with dcon:
            scon.backup(dcon)
    finally:
        dcon.close()
        scon.close()
    _rotate()
    return dest.name


def _rotate() -> None:
    backups = sorted(BACKUP_DIR.glob("guardpay-*.db"), reverse=True)
    for old in backups[BACKUP_KEEP:]:
        try:
            old.unlink()
        except OSError:
            pass


async def maybe_backup_before_change(suffix: str) -> str | None:
    """Snapshot before a destructive change when `backup_before_changes` is on."""
    try:
        from ..models import Setting

        async with AsyncSessionLocal() as session:
            row = await session.get(Setting, "backup_before_changes")
            enabled = (row.value if row else "0") == "1"
        if not enabled:
            return None
        return await asyncio.to_thread(create_snapshot, suffix)
    except FileNotFoundError:
        return None


async def snapshot_before_restore() -> str:
    """Unconditional safety snapshot taken before a restore replaces the live DB.
    Unlike maybe_backup_before_change this ignores the `backup_before_changes`
    setting — a restore is always recoverable from this snapshot."""
    return await asyncio.to_thread(create_snapshot, "prerestore")


async def daily_snapshot_if_needed() -> str | None:
    """Create one `-auto` snapshot per UTC day; no-op if one already exists."""
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    for f in BACKUP_DIR.glob("guardpay-*.db"):
        name = f.name
        if _stamp_of(name) == today and name.endswith("-auto.db"):
            return None
    try:
        return await asyncio.to_thread(create_snapshot, "auto")
    except FileNotFoundError:
        return None


def _stamp_of(filename: str) -> str:
    # guardpay-YYYYMMDD-HHMMSS-<suffix>.db
    prefix = "guardpay-"
    if filename.startswith(prefix):
        return filename[len(prefix): len(prefix) + 8]
    return ""