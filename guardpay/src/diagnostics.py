"""
Lightweight self-test runner for the Settings > Diagnostics panel.

Deliberately not a pytest suite — GuardPay is stdlib-only and these checks
need to run inside the live server process against the live database, in
under a second, from a button click. Each check is (name, function); a
function returns (ok: bool, detail: str).
"""
import os
import time

from .config import DB_FILE, BACKUP_DIR, LOG_FILE
from .database import get_db
from .sms_import import selftest as _sms_selftest

EXPECTED_TABLES = {
    'settings', 'houses', 'payments', 'guard_payments', 'fee_change',
    'audit_log', 'auth_secret', 'house_reminder', 'attachment',
    'schema_version', 'integrations',
}


def _check_db_integrity():
    conn = get_db()
    try:
        row = conn.execute("PRAGMA integrity_check").fetchone()
        ok = bool(row) and row[0] == 'ok'
        return ok, (row[0] if row else 'no result')
    finally:
        conn.close()


def _check_wal_mode():
    conn = get_db()
    try:
        row = conn.execute("PRAGMA journal_mode").fetchone()
        mode = row[0] if row else '?'
        return mode.lower() == 'wal', mode
    finally:
        conn.close()


def _check_tables_exist():
    conn = get_db()
    try:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        found = {r['name'] for r in rows}
        missing = EXPECTED_TABLES - found
        return (not missing), ("all present" if not missing else "missing: " + ", ".join(sorted(missing)))
    finally:
        conn.close()


def _check_write_roundtrip():
    conn = get_db()
    try:
        marker = str(time.time())
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('__selftest__', ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (marker, marker)
        )
        conn.commit()
        row = conn.execute("SELECT value FROM settings WHERE key='__selftest__'").fetchone()
        conn.execute("DELETE FROM settings WHERE key='__selftest__'")
        conn.commit()
        return (bool(row) and row['value'] == marker), "insert / read / delete round trip"
    finally:
        conn.close()


def _check_backup_dir_writable():
    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        probe = os.path.join(BACKUP_DIR, '.selftest')
        with open(probe, 'w') as f:
            f.write('ok')
        os.remove(probe)
        return True, BACKUP_DIR
    except OSError as e:
        return False, str(e)


def _check_auth_secret_row():
    conn = get_db()
    try:
        row = conn.execute("SELECT session_secret FROM auth_secret WHERE id=1").fetchone()
        return bool(row and row['session_secret']), ("present" if row else "missing — sessions won't work")
    finally:
        conn.close()


def _check_orphan_payments():
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) AS n FROM payments p LEFT JOIN houses h ON h.id = p.house_id WHERE h.id IS NULL"
        ).fetchone()
        n = row['n'] if row else 0
        return n == 0, ("none" if n == 0 else f"{n} payment rows point at a house that no longer exists")
    finally:
        conn.close()


def _check_disk_space():
    try:
        usage = os.statvfs(os.path.dirname(DB_FILE) or '.')
        free_mb = usage.f_bavail * usage.f_frsize / (1024 * 1024)
        return free_mb > 50, f"{free_mb:.0f} MB free"
    except (AttributeError, OSError):
        # os.statvfs isn't available on Windows — not a failure, just unknown.
        return True, "unavailable on this OS"


def _check_sms_parser_formats():
    ok, results = _sms_selftest()
    fails = [r['name'] for r in results if not r['ok']]
    total = len(results)
    return ok, (f"{total - len(fails)}/{total} formats ok" if not fails
                else "failed: " + ", ".join(fails))


CHECKS = [
    ("Database integrity", _check_db_integrity),
    ("WAL journal mode active", _check_wal_mode),
    ("Expected tables present", _check_tables_exist),
    ("Write / read / delete round-trip", _check_write_roundtrip),
    ("Backup directory writable", _check_backup_dir_writable),
    ("Session secret present", _check_auth_secret_row),
    ("No orphaned payment rows", _check_orphan_payments),
    ("SMS parser formats", _check_sms_parser_formats),
    ("Disk space", _check_disk_space),
]


def run_self_test():
    results = []
    overall_ok = True
    for name, fn in CHECKS:
        t0 = time.time()
        try:
            ok, detail = fn()
        except Exception as e:  # a check crashing is itself a failed check, not a 500
            ok, detail = False, f"threw {type(e).__name__}: {e}"
        if not ok:
            overall_ok = False
        results.append({"name": name, "ok": ok, "detail": detail, "ms": round((time.time() - t0) * 1000, 1)})
    return {"ok": overall_ok, "checks": results, "db_file": DB_FILE, "log_file": LOG_FILE}


def tail_log(n=200):
    if not os.path.exists(LOG_FILE):
        return ["(no log file yet — nothing has been written since GuardPay last started)"]
    try:
        with open(LOG_FILE, 'r', encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
        return [line.rstrip('\n') for line in lines[-n:]] or ["(log file is empty)"]
    except OSError as e:
        return [f"(could not read log file: {e})"]
