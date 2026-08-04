"""
Shared utility functions — parsing, timestamps, IP detection.
"""
import calendar
import re
import socket
from datetime import datetime, date, timezone

_MONTH_RE = re.compile(r'^\d{4}-\d{2}$')
_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_int(value, default=None, min_val=None, max_val=None):
    if value is None and default is not None:
        value = default
    try:
        v = int(value)
    except (TypeError, ValueError):
        return None, "must be a whole number"
    if min_val is not None and v < min_val:
        return None, f"must be at least {min_val}"
    if max_val is not None and v > max_val:
        return None, f"must be at most {max_val}"
    return v, None


def parse_month(value):
    if not isinstance(value, str) or not _MONTH_RE.match(value):
        return None, "invalid month (expected YYYY-MM)"
    y, m = value.split('-')
    try:
        mi = int(m)
        if not (1 <= mi <= 12):
            return None, "month out of range"
        calendar.monthrange(int(y), mi)
    except (ValueError, OverflowError):
        return None, "invalid month"
    return value, None


def parse_date(value):
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return None, "invalid date (expected YYYY-MM-DD)"
    try:
        date.fromisoformat(value)
    except (ValueError, OverflowError):
        return None, "invalid date"
    return value, None


def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except OSError:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip
