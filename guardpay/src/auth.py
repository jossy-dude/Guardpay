"""
PIN hashing (PBKDF2), session token (HMAC-SHA256), and verification.
"""
import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import SESSION_MAX_AGE
from .database import get_db
from .utils import now_iso


def _auth_row(conn):
    return conn.execute("SELECT * FROM auth_secret WHERE id=1").fetchone()


def hash_pin(pin, salt, iterations=200000):
    return hashlib.pbkdf2_hmac('sha256', pin.encode('utf-8'), bytes.fromhex(salt), iterations).hex()


def set_pin(conn, pin):
    salt = secrets.token_hex(16)
    iterations = 200000
    h = hash_pin(pin, salt, iterations)
    conn.execute(
        "UPDATE auth_secret SET pin_enabled=1, pin_hash=?, pin_salt=?, iterations=?, updated_at=? WHERE id=1",
        (h, salt, iterations, now_iso())
    )


def disable_pin(conn):
    conn.execute(
        "UPDATE auth_secret SET pin_enabled=0, pin_hash=NULL, pin_salt=NULL, updated_at=? WHERE id=1",
        (now_iso(),)
    )


def verify_pin(conn, pin):
    row = _auth_row(conn)
    if not row or not row['pin_enabled'] or not row['pin_hash']:
        return False
    candidate = hash_pin(pin, row['pin_salt'], row['iterations'])
    return hmac.compare_digest(candidate, row['pin_hash'])


def make_session_token(secret):
    payload = base64.urlsafe_b64encode(
        json.dumps({'iat': int(time.time())}).encode('utf-8')
    ).decode('ascii').rstrip('=')
    sig = hmac.new(secret.encode('utf-8'), payload.encode('ascii'), hashlib.sha256).hexdigest()
    return payload + '.' + sig


def verify_session_token(secret, token):
    if not token or '.' not in token:
        return False
    payload, sig = token.rsplit('.', 1)
    expected = hmac.new(secret.encode('utf-8'), payload.encode('ascii'), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False
    try:
        pad = '=' * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload + pad))
        return (int(time.time()) - int(data.get('iat', 0))) < SESSION_MAX_AGE
    except Exception:
        return False


def pin_enabled():
    conn = get_db()
    try:
        row = _auth_row(conn)
        return bool(row and row['pin_enabled'])
    finally:
        conn.close()
