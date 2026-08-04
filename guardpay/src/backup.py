"""
Backup management — create, rotate, auto-snapshot, pre-change snapshots.
Uses the SQLite online backup API for consistent hot copies.
"""
import os
import re
import sqlite3
from datetime import datetime

from .config import DB_FILE, BACKUP_DIR, BACKUP_KEEP
from .settings import get_settings


def ensure_backup_dir():
    os.makedirs(BACKUP_DIR, exist_ok=True)


def create_backup(reason='manual'):
    """Consistent online snapshot via sqlite backup API. Returns path."""
    ensure_backup_dir()
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    safe_reason = re.sub(r'[^a-z0-9_-]', '', reason.lower())[:24] or 'backup'
    path = os.path.join(BACKUP_DIR, f"guardpay-{stamp}-{safe_reason}.db")
    src = sqlite3.connect(DB_FILE)
    try:
        dst = sqlite3.connect(path)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    rotate_backups()
    return path


def restore_backup(filename):
    """Restore the live database from a .db snapshot in BACKUP_DIR.

    Always takes a 'prerestore' safety snapshot of the CURRENT state first —
    so restoring is itself reversible: if you pick the wrong one, restore the
    prerestore snapshot it just made.
    """
    ensure_backup_dir()
    safe_name = os.path.basename(str(filename))
    real_dir = os.path.realpath(BACKUP_DIR)
    real_path = os.path.realpath(os.path.join(BACKUP_DIR, safe_name))
    if not real_path.startswith(real_dir + os.sep):
        raise ValueError("Invalid backup file")
    if not (safe_name.startswith('guardpay-') and safe_name.endswith('.db')):
        raise ValueError("Invalid backup file")
    if not os.path.isfile(real_path):
        raise ValueError("Backup file not found")

    create_backup('prerestore')

    src = sqlite3.connect(real_path)
    try:
        dst = sqlite3.connect(DB_FILE)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return True


def backup_file_path(filename):
    """Validate + resolve a backup filename for download. Raises ValueError if unsafe/missing."""
    ensure_backup_dir()
    safe_name = os.path.basename(str(filename))
    real_dir = os.path.realpath(BACKUP_DIR)
    real_path = os.path.realpath(os.path.join(BACKUP_DIR, safe_name))
    if not real_path.startswith(real_dir + os.sep) or not (safe_name.startswith('guardpay-') and safe_name.endswith('.db')):
        raise ValueError("Invalid backup file")
    if not os.path.isfile(real_path):
        raise ValueError("Backup file not found")
    return real_path, safe_name


def rotate_backups(keep=BACKUP_KEEP):
    ensure_backup_dir()
    files = [os.path.join(BACKUP_DIR, f) for f in os.listdir(BACKUP_DIR)
             if f.startswith('guardpay-') and f.endswith('.db')]
    files.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    for old in files[keep:]:
        try:
            os.remove(old)
        except OSError:
            pass


def daily_snapshot_if_needed():
    """One automatic snapshot per calendar day on startup."""
    ensure_backup_dir()
    today = datetime.now().strftime('%Y%m%d')
    existing = [f for f in os.listdir(BACKUP_DIR)
                if f.startswith(f"guardpay-{today}") and 'auto' in f]
    if not existing:
        try:
            create_backup('auto')
        except Exception:
            pass


def maybe_backup_before_change():
    """Snapshot before a destructive op if the setting is enabled."""
    try:
        s = get_settings()
        if s.get('backup_before_changes') == '1':
            create_backup('prechange')
    except Exception:
        pass
