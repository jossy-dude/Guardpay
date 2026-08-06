"""Programmatic Alembic runner used at app startup.

GuardPay v2 uses SQLite WAL and `Base.metadata.create_all` historically. From
now on schema changes ship as Alembic migrations (apps/backend/alembic/versions).
This module runs `upgrade head` at startup and, critically, auto-stamps legacy
databases — a DB that has tables but no `alembic_version` row (created before
Alembic, or a restored pre-Alembic snapshot) is marked at the head revision so
the first boot after upgrade doesn't fail with "table already exists".
"""

import asyncio
from pathlib import Path
from typing import TYPE_CHECKING

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from .config import DB_URL

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncEngine

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # apps/backend


def _cfg() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", DB_URL)
    return cfg


def _baseline_revision(cfg: Config) -> str:
    """The root migration (the one with no down_revision).

    A legacy database created by old code (no Alembic) matches the *baseline*
    schema. Stamping it to the baseline (rather than head) lets `upgrade head`
    then actually run every later migration (constraints, future changes).
    """
    scripts = ScriptDirectory.from_config(cfg)
    root = next((r for r in scripts.walk_revisions() if r.down_revision is None), None)
    return str(root.revision) if root is not None else "head"


async def _is_legacy(engine: "AsyncEngine") -> bool:
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = {row[0] for row in res}
    return "alembic_version" not in tables and bool(tables)


async def run_migrations(engine: "AsyncEngine") -> None:
    cfg = _cfg()
    if await _is_legacy(engine):
        # Pre-Alembic DB: stamp at the baseline revision (not head) so subsequent
        # migrations still apply. Runs in a worker thread (env.py uses a sync engine).
        await asyncio.to_thread(command.stamp, cfg, _baseline_revision(cfg))
    await asyncio.to_thread(command.upgrade, cfg, "head")
