"""
Settings CRUD — get, validate, and persist neighbourhood configuration.
"""
import re

from .config import KNOWN_SETTINGS, MAX_DUE_DAY, MAX_CURRENCY_LENGTH, MAX_SETTING_VALUE_LENGTH
from .database import get_db
from .utils import parse_int, now_iso


def get_settings():
    conn = get_db()
    try:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    finally:
        conn.close()
    return {row['key']: row['value'] for row in rows}


def validate_settings(data):
    """Return (clean_dict, error). Only whitelisted keys, validated."""
    clean = {}
    for key, value in data.items():
        if key not in KNOWN_SETTINGS:
            continue
        if key == 'due_day':
            v, err = parse_int(value, min_val=1, max_val=MAX_DUE_DAY)
            if err:
                return None, f"Due day {err}"
            clean[key] = str(v)
        elif key in ('guard_salary', 'default_fee'):
            v, err = parse_int(value, min_val=0)
            if err:
                return None, f"{key} {err}"
            clean[key] = str(v)
        elif key == 'parse_start_date':
            s = str(value).strip()
            if s:
                from .utils import parse_date
                d, derr = parse_date(s)
                if derr:
                    return None, f"Start date {derr}"
            clean[key] = s
        elif key == 'guard_account_suffix':
            s = re.sub(r'\D', '', str(value))[-6:] if str(value).strip() else ''
            clean[key] = s
        elif key == 'currency':
            s = str(value).strip()
            if not s or len(s) > MAX_CURRENCY_LENGTH:
                return None, f"Currency must be 1-{MAX_CURRENCY_LENGTH} characters"
            clean[key] = s
        elif key == 'backup_before_changes':
            clean[key] = '1' if str(value) in ('1', 'true', 'True', 'on') else '0'
        elif key in ('neighborhood_name', 'guard_name'):
            s = str(value).strip()
            if len(s) > MAX_SETTING_VALUE_LENGTH:
                return None, f"{key} is too long"
            clean[key] = s
        else:
            s = str(value).strip()
            if not s:
                return None, f"{key} is required"
            if len(s) > MAX_SETTING_VALUE_LENGTH:
                return None, f"{key} is too long"
            clean[key] = s
    return clean, None


def save_settings(conn, clean):
    ts = now_iso()
    for key, value in clean.items():
        conn.execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, value, ts)
        )
