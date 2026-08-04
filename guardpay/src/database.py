"""
Database schema, connection management, and initialisation.
Uses SQLite WAL mode with foreign keys and busy-timeout.
"""
import secrets
import sqlite3
import threading

from .config import DB_FILE, SCHEMA_VERSION, DEFAULT_SETTINGS
from .utils import now_iso

LOCK = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version     INTEGER PRIMARY KEY CHECK (version >= 1),
    applied_at  TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS houses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    house_number  TEXT    NOT NULL,
    fee           INTEGER NOT NULL DEFAULT 500 CHECK (fee >= 0),
    notes         TEXT    NOT NULL DEFAULT '',
    active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_month TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL,
    deleted_at    TEXT,
    UNIQUE (house_number)
);
CREATE TABLE IF NOT EXISTS payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE RESTRICT,
    month_key  TEXT    NOT NULL,
    paid_date  TEXT,
    amount     INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    note       TEXT    NOT NULL DEFAULT '',
    sms_source_id INTEGER REFERENCES sms_candidates(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE (house_id, month_key)
);
CREATE TABLE IF NOT EXISTS guard_payments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    month_key  TEXT    NOT NULL,
    paid_date  TEXT    NOT NULL,
    amount     INTEGER NOT NULL CHECK (amount >= 0),
    method     TEXT    NOT NULL DEFAULT 'transfer',
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE (month_key)
);
CREATE TABLE IF NOT EXISTS fee_change (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE RESTRICT,
    old_fee    INTEGER,
    new_fee    INTEGER NOT NULL CHECK (new_fee >= 0),
    changed_at TEXT    NOT NULL,
    note       TEXT    NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity      TEXT NOT NULL,
    entity_id   INTEGER,
    before_json TEXT,
    after_json  TEXT,
    created_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_secret (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    pin_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (pin_enabled IN (0,1)),
    pin_hash         TEXT,
    pin_salt         TEXT,
    iterations       INTEGER NOT NULL DEFAULT 200000,
    session_secret   TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    last_verified_at TEXT
);
CREATE TABLE IF NOT EXISTS house_reminder (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id    INTEGER NOT NULL REFERENCES houses(id) ON DELETE RESTRICT,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    reminded_at TEXT
);
CREATE TABLE IF NOT EXISTS integrations (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS attachment (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type  TEXT NOT NULL,
    entity_id    INTEGER NOT NULL,
    filename     TEXT NOT NULL,
    content_type TEXT,
    file_size    INTEGER,
    storage_path TEXT NOT NULL,
    note         TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_month       ON payments(month_key);
CREATE INDEX IF NOT EXISTS idx_payments_house_month ON payments(house_id, month_key);
CREATE INDEX IF NOT EXISTS idx_houses_active        ON houses(active);
CREATE INDEX IF NOT EXISTS idx_guard_month          ON guard_payments(month_key);
CREATE INDEX IF NOT EXISTS idx_fee_change_house     ON fee_change(house_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity         ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created        ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_reminder_active      ON house_reminder(house_id, is_active);
CREATE INDEX IF NOT EXISTS idx_attachment_entity    ON attachment(entity_type, entity_id);
CREATE TABLE IF NOT EXISTS house_aliases (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
    alias      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (house_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_house_aliases_alias  ON house_aliases(alias);
CREATE TABLE IF NOT EXISTS sms_candidates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    bank             TEXT NOT NULL DEFAULT 'CBE',
    account_last4    TEXT NOT NULL DEFAULT '',
    direction        TEXT NOT NULL DEFAULT 'credit',
    amount           INTEGER NOT NULL DEFAULT 0,
    balance          INTEGER NOT NULL DEFAULT 0,
    txn_date         TEXT NOT NULL,
    txn_ts           INTEGER NOT NULL,
    ref_no           TEXT NOT NULL DEFAULT '',
    payer_raw        TEXT NOT NULL DEFAULT '',
    matched_house_id INTEGER REFERENCES houses(id) ON DELETE SET NULL,
    months           INTEGER NOT NULL DEFAULT 1,
    month_from       TEXT NOT NULL DEFAULT '',
    note             TEXT NOT NULL DEFAULT '',
    is_duplicate     INTEGER NOT NULL DEFAULT 0,
    confidence       TEXT NOT NULL DEFAULT 'MEDIUM',
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    UNIQUE (bank, txn_ts, amount, account_last4)
);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_candidates(status);
CREATE INDEX IF NOT EXISTS idx_sms_house  ON sms_candidates(matched_house_id);
CREATE INDEX IF NOT EXISTS idx_sms_date   ON sms_candidates(txn_date);
"""


# ---------------------------------------------------------------------------
# Migrations — the scalable path for evolving the schema after real data exists.
#
# init_db() below runs SCHEMA (CREATE TABLE IF NOT EXISTS ...) which is enough
# for a brand-new database, but does nothing for a database that already exists
# with an older shape. MIGRATIONS is the ordered list of changes that bring an
# existing DB forward, one version at a time. Each entry runs exactly once.
#
# To add a schema change in the future:
#   1. Bump SCHEMA_VERSION in config.py
#   2. Append a (version, sql, description) tuple here — never edit an old one
#   3. Restart the server; run_migrations() applies it automatically
# ---------------------------------------------------------------------------
MIGRATIONS = [
    (2, """
        CREATE TABLE IF NOT EXISTS integrations (
            key        TEXT PRIMARY KEY,
            value      TEXT,
            updated_at TEXT NOT NULL DEFAULT ''
        );
    """, "integrations table (Google Drive tokens and similar linked-account config)"),
    (3, """
        CREATE TABLE IF NOT EXISTS house_aliases (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            house_id   INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
            alias      TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (house_id, alias)
        );
        CREATE INDEX IF NOT EXISTS idx_house_aliases_alias ON house_aliases(alias);
        CREATE TABLE IF NOT EXISTS sms_candidates (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            bank             TEXT NOT NULL DEFAULT 'CBE',
            account_last4    TEXT NOT NULL DEFAULT '',
            direction        TEXT NOT NULL DEFAULT 'credit',
            amount           INTEGER NOT NULL DEFAULT 0,
            balance          INTEGER NOT NULL DEFAULT 0,
            txn_date         TEXT NOT NULL,
            txn_ts           INTEGER NOT NULL,
            ref_no           TEXT NOT NULL DEFAULT '',
            payer_raw        TEXT NOT NULL DEFAULT '',
            matched_house_id INTEGER REFERENCES houses(id) ON DELETE SET NULL,
            months           INTEGER NOT NULL DEFAULT 1,
            month_from       TEXT NOT NULL DEFAULT '',
            note             TEXT NOT NULL DEFAULT '',
            is_duplicate     INTEGER NOT NULL DEFAULT 0,
            confidence       TEXT NOT NULL DEFAULT 'MEDIUM',
            status           TEXT NOT NULL DEFAULT 'pending',
            created_at       TEXT NOT NULL,
            updated_at       TEXT NOT NULL,
            UNIQUE (bank, txn_ts, amount, account_last4)
        );
        CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_candidates(status);
        CREATE INDEX IF NOT EXISTS idx_sms_house  ON sms_candidates(matched_house_id);
        CREATE INDEX IF NOT EXISTS idx_sms_date   ON sms_candidates(txn_date);

        -- Align money-derived defaults for any database seeded before v3
        UPDATE settings SET value='4000',  updated_at=updated_at WHERE key='default_fee'    AND value='500';
        UPDATE settings SET value='30000', updated_at=updated_at WHERE key='guard_salary'  AND value='8000';
        INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('guard_account_suffix', '3325', ''), ('parse_start_date', '', '');
    """, "SMS import: house aliases, review candidates, and import defaults"),
    (4, """
        ALTER TABLE sms_candidates ADD COLUMN note TEXT NOT NULL DEFAULT '';
        ALTER TABLE sms_candidates ADD COLUMN is_duplicate INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE payments ADD COLUMN sms_source_id INTEGER REFERENCES sms_candidates(id) ON DELETE SET NULL;
    """, "SMS import review sheet: per-row note, duplicate flag, and payment provenance"),
]


def run_migrations(conn):
    row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
    current = row['v'] if row and row['v'] is not None else 1
    for version, sql, description in MIGRATIONS:
        if version <= current:
            continue
        conn.executescript(sql)
        conn.execute(
            "INSERT OR IGNORE INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
            (version, now_iso(), description)
        )
        current = version
    conn.commit()


def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA journal_size_limit=67108864")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.executescript(SCHEMA)
        row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
        if row is None or row['v'] is None:
            # Fresh database — SCHEMA above already created every table at the
            # current shape, so record it as already fully migrated.
            conn.execute(
                "INSERT INTO schema_version (version, applied_at, description) VALUES (?, ?, ?)",
                (SCHEMA_VERSION, now_iso(), "initial schema")
            )
        else:
            # Existing database — bring it forward to SCHEMA_VERSION.
            run_migrations(conn)
        ts = now_iso()
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, ts)
            )
        # ensure single auth_secret row exists
        arow = conn.execute("SELECT id FROM auth_secret WHERE id=1").fetchone()
        if arow is None:
            conn.execute(
                "INSERT INTO auth_secret (id, pin_enabled, session_secret, created_at, updated_at) "
                "VALUES (1, 0, ?, ?, ?)",
                (secrets.token_hex(32), ts, ts)
            )
        conn.commit()
    finally:
        conn.close()
