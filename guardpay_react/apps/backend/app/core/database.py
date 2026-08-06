from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import DB_URL

# Robust SQLite config for a single-user local app:
#  - WAL journaling avoids lock contention between async pool connections
#  - foreign_keys=ON keeps referential integrity
#  - busy_timeout prevents transient "database is locked" errors
engine = create_async_engine(
    DB_URL,
    echo=False,
    future=True,
    connect_args={"timeout": 15, "check_same_thread": False},
)


@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=15000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()
    except Exception:
        # Non-SQLite (or exotic) backends: pragmas are optional.
        pass


AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def _checkpoint_wal() -> None:
    """Fold the WAL back into the main DB file on startup.

    SQLite WAL keeps recent writes in the -wal file; a long-running app can
    leave a large WAL while the .db file is stale. Folding it on startup makes
    manual file copies/backups safe. Uses a dedicated sync connection with a
    PASSIVE fallback (TRUNCATE can return SQLITE_BUSY if other connections
    hold read transactions).
    """
    try:
        import sqlite3

        from .config import DB_PATH

        con = sqlite3.connect(DB_PATH, timeout=15)
        try:
            mode = con.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()[0]
            if mode != 0:
                con.execute("PRAGMA wal_checkpoint(PASSIVE)")
        finally:
            con.close()
    except Exception:
        pass


async def init_db() -> None:
    """Run Alembic migrations, then seed defaults for a fresh database."""
    from .migrations import run_migrations

    await _checkpoint_wal()
    await run_migrations(engine)
    # seed default settings
    from ..models import Setting
    from .config import DEFAULT_SETTINGS

    async with AsyncSessionLocal() as session:
        for k, v in DEFAULT_SETTINGS.items():
            existing = await session.get(Setting, k)
            if existing is None:
                session.add(Setting(key=k, value=v))
        # ensure single auth row
        from ..models import AuthSecret

        existing_auth = await session.get(AuthSecret, 1)
        if existing_auth is None:
            session.add(AuthSecret(id=1, pin_enabled=False))
        await session.commit()


def db_file_path() -> Path:
    from .config import DB_PATH

    return Path(DB_PATH)