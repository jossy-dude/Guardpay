"""
Per-IP sliding-window rate limiter.
Loopback addresses are exempt.
"""
import threading
import time

from .config import RATE_LIMIT_MAX, RATE_LIMIT_WINDOW

_rate_state = {}
_rate_lock = threading.Lock()


def rate_ok(ip):
    if ip in ('127.0.0.1', '::1', 'localhost'):
        return True
    now = time.time()
    with _rate_lock:
        cutoff = now - max(RATE_LIMIT_WINDOW, 3600)
        stale = [k for k, v in _rate_state.items() if v and v[-1] < cutoff]
        for k in stale:
            del _rate_state[k]
        hits = _rate_state.get(ip, [])
        hits = [t for t in hits if now - t < RATE_LIMIT_WINDOW]
        if len(hits) >= RATE_LIMIT_MAX:
            _rate_state[ip] = hits
            return False
        hits.append(now)
        _rate_state[ip] = hits
        return True
