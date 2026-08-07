import asyncio
import os
import sqlite3
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import BACKUP_DIR, DB_PATH
from ..core.database import get_db
from ..services.backups import _stamp, create_snapshot, snapshot_before_restore

router = APIRouter(prefix="/api/backups", tags=["backups"])


@router.get("")
async def list_backups():
    out = []
    for f in sorted(BACKUP_DIR.glob("guardpay-*.db"), reverse=True):
        out.append({"file": f.name, "size": f.stat().st_size, "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds")})
    return out


@router.post("/create")
async def create_backup(session: AsyncSession = Depends(get_db)):
    try:
        name = await asyncio.to_thread(create_snapshot, "manual")
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    return {"ok": True, "file": name}


REQUIRED_TABLES = {
    "houses",
    "payments",
    "guard_payments",
    "settings",
    "audit_log",
    "house_reminder",
    "house_aliases",
    "fee_change",
}


def _validate_backup(src: Path) -> None:
    """Ensure `src` is a valid GuardPay database before it replaces the live one."""
    if not src.exists() or src.stat().st_size < 1024:
        raise HTTPException(400, "Backup file is empty or too small to be a valid database")
    con = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    try:
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise HTTPException(400, "Backup failed integrity check")
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = REQUIRED_TABLES - tables
        if missing:
            raise HTTPException(400, f"Backup is missing required tables: {', '.join(sorted(missing))}")
    finally:
        con.close()


@router.post("/restore")
async def restore_backup(body: dict, session: AsyncSession = Depends(get_db)):
    filename = body.get("file")
    if not filename:
        raise HTTPException(400, "Missing file name")
    src = BACKUP_DIR / Path(filename).name

    # Validate the backup *before* taking any snapshot so repeated bad requests
    # no longer fill the backups dir with useless prerestore snapshots.
    if not src.exists() or not Path(DB_PATH).exists():
        if not src.exists():
            raise HTTPException(404, "Backup not found")
        raise HTTPException(404, "Database file not found")
    await asyncio.to_thread(_validate_backup, src)

    # Snapshot the current auth/PIN state so restoring an old backup (taken
    # before PIN setup) can't silently leave the app wide open.
    auth_state = await asyncio.to_thread(_capture_auth_state)

    # A safety snapshot of the current DB is ALWAYS taken before anything is
    # replaced, so a bad restore is recoverable through the same UI regardless
    # of the `backup_before_changes` setting.
    await snapshot_before_restore()

    await asyncio.to_thread(_do_restore, src)

    # A restored pre-Alembic snapshot has no alembic_version table; stamp it so
    # the next boot's `upgrade head` is a no-op instead of "table already exists".
    try:
        from ..core.database import engine
        from ..core.migrations import run_migrations

        await run_migrations(engine)
    except Exception:
        pass

    # Preserve the current PIN/session auth across the restore.
    await asyncio.to_thread(_restore_auth_state, auth_state)
    return {"ok": True, "restart": False}


def _capture_auth_state() -> dict | None:
    """Read the current auth_secret row so it survives a restore."""
    try:
        import sqlite3

        con = sqlite3.connect(DB_PATH)
        try:
            row = con.execute(
                "SELECT pin_enabled, pin_hash, pin_salt, iterations, session_secret, created_at, updated_at "
                "FROM auth_secret WHERE id = 1"
            ).fetchone()
        finally:
            con.close()
        if not row:
            return None
        return {
            "pin_enabled": row[0],
            "pin_hash": row[1],
            "pin_salt": row[2],
            "iterations": row[3],
            "session_secret": row[4],
            "created_at": row[5],
            "updated_at": row[6],
        }
    except Exception:
        return None


def _restore_auth_state(auth_state: dict | None) -> None:
    if not auth_state:
        return
    try:
        import sqlite3

        con = sqlite3.connect(DB_PATH)
        try:
            with con:
                con.execute(
                    "INSERT INTO auth_secret "
                    "(id, pin_enabled, pin_hash, pin_salt, iterations, session_secret, created_at, updated_at) "
                    "VALUES (1, ?, ?, ?, ?, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET "
                    "pin_enabled=excluded.pin_enabled, pin_hash=excluded.pin_hash, "
                    "pin_salt=excluded.pin_salt, iterations=excluded.iterations, "
                    "session_secret=excluded.session_secret, created_at=excluded.created_at, "
                    "updated_at=excluded.updated_at",
                    (
                        auth_state["pin_enabled"],
                        auth_state["pin_hash"],
                        auth_state["pin_salt"],
                        auth_state["iterations"],
                        auth_state["session_secret"],
                        auth_state["created_at"],
                        auth_state["updated_at"],
                    ),
                )
        finally:
            con.close()
    except Exception:
        import logging

        logging.getLogger("guardpay.backups").exception("failed to preserve auth state after restore")


def _do_restore(src: Path) -> None:
    dest = Path(DB_PATH)
    tmp = dest.with_suffix(f".restore-{_stamp()}{dest.suffix}")
    try:
        scon = sqlite3.connect(src)
        tcon = sqlite3.connect(tmp)
        try:
            with tcon:
                scon.backup(tcon)
        finally:
            tcon.close()
            scon.close()
        tcon = sqlite3.connect(tmp)
        try:
            if tcon.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise HTTPException(400, "Restored database failed integrity check")
        finally:
            tcon.close()
        os.replace(tmp, dest)
    finally:
        if tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass


@router.get("/download/{filename}")
async def download_backup(filename: str):
    path = BACKUP_DIR / Path(filename).name
    if not path.exists():
        raise HTTPException(404, "Backup not found")
    return FileResponse(path, filename=path.name)
