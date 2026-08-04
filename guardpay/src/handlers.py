"""
HTTP request handler — all route logic for GET, POST, and OPTIONS.
Imports business-logic functions from the other src modules.
"""
import csv
import io
import json
import os
import sqlite3
import urllib.error
from datetime import date, datetime

from http.server import BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from urllib.parse import urlparse, parse_qs

from .config import (
    BASE_DIR, STATIC_DIR, BACKUP_DIR, MIME_TYPES, MAX_BODY_BYTES, SCHEMA_VERSION, GUARD_METHODS,
    DEFAULT_HOUSE_FEE, DEFAULT_AUDIT_LIMIT, MAX_AUDIT_LIMIT, MAX_AUDIT_EXPORT, SESSION_MAX_AGE,
)
from .database import get_db, LOCK
from .utils import now_iso, parse_int, parse_month, parse_date
from .audit import write_audit
from .settings import get_settings, validate_settings, save_settings
from .auth import (
    _auth_row, pin_enabled, verify_pin, verify_session_token,
    make_session_token, set_pin, disable_pin,
)
from .backup import (
    create_backup, daily_snapshot_if_needed, maybe_backup_before_change, ensure_backup_dir,
    restore_backup, backup_file_path,
)
from .ratelimit import rate_ok
from .diagnostics import run_self_test, tail_log
from .applog import get_logger
from . import gdrive
from . import sms_import

LOGGER = get_logger()


class Handler(BaseHTTPRequestHandler):
    server_version = "GuardPay/2.0"

    def log_message(self, fmt, *args):
        # Overrides BaseHTTPRequestHandler's default (which prints every
        # request to stderr — noisy in a terminal left open all day).
        # Goes to guardpay.log instead; read via Settings > Diagnostics.
        try:
            LOGGER.info("%s - %s", self._client_ip(), fmt % args)
        except Exception:
            pass

    def log_error(self, fmt, *args):
        try:
            LOGGER.error("%s - %s", self._client_ip(), fmt % args)
        except Exception:
            pass

    # ----- response helpers
    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")

    def _send_json(self, obj, status=200, extra_headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._security_headers()
        if extra_headers:
            for k, v in extra_headers:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path, content_type):
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        if content_type != "text/html; charset=utf-8":
            self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _client_ip(self):
        return self.client_address[0] if self.client_address else '?'

    # ----- auth
    def _cookies(self):
        c = SimpleCookie()
        raw = self.headers.get('Cookie')
        if raw:
            c.load(raw)
        return c

    def _is_authed(self):
        conn = get_db()
        try:
            row = _auth_row(conn)
            if not row or not row['pin_enabled']:
                return True
            token = None
            c = self._cookies()
            if 'gp_session' in c:
                token = c['gp_session'].value
            return verify_session_token(row['session_secret'], token)
        finally:
            conn.close()

    def _actor(self):
        return 'pin' if not self._is_open() else 'anon'

    def _is_open(self):
        return not pin_enabled()

    # ----- GET
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        if not rate_ok(self._client_ip()):
            self._send_json({"error": "Too many requests"}, status=429)
            return

        # Always-open endpoints
        if path == "/api/auth/status":
            self._send_json(self._auth_status())
            return
        if path == "/api/integrations/gdrive/callback":
            self._gdrive_callback(params)
            return

        if path.startswith("/api/"):
            if not self._is_authed():
                self._send_json({"error": "PIN required", "locked": True}, status=401)
                return

        if path == "/api/state":
            with LOCK:
                state = self._get_full_state()
            self._send_json(state)
            return
        if path == "/api/houses":
            with LOCK:
                self._send_json(self._get_houses())
            return
        if path == "/api/payments":
            month = params.get('month', [None])[0]
            with LOCK:
                self._send_json(self._get_payments(month))
            return
        if path == "/api/stats":
            month = params.get('month', [None])[0]
            with LOCK:
                self._send_json(self._get_stats(month))
            return
        if path == "/api/guard-payments":
            with LOCK:
                self._send_json(self._get_guard_payments())
            return
        if path == "/api/reminders":
            with LOCK:
                self._send_json(self._get_reminders())
            return
        if path == "/api/audit":
            limit = params.get('limit', [str(DEFAULT_AUDIT_LIMIT)])[0]
            with LOCK:
                self._send_json(self._get_audit(limit))
            return
        if path == "/api/backups":
            with LOCK:
                self._send_json(self._list_backups())
            return
        if path == "/api/backup/download":
            filename = params.get('file', [None])[0]
            with LOCK:
                self._send_backup_file(filename)
            return
        if path == "/api/integrations/gdrive/status":
            with LOCK:
                self._send_json(gdrive.status())
            return
        if path == "/api/export/csv":
            with LOCK:
                self._send_csv()
            return
        if path == "/api/export/json":
            with LOCK:
                self._send_json_backup()
            return
        if path == "/api/sms/review":
            with LOCK:
                self._send_json(self._sms_review_list())
            return
        if path == "/api/sms/namepool":
            with LOCK:
                self._send_json(self._sms_name_pool())
            return
        if path == "/api/sms/summary":
            with LOCK:
                self._send_json(self._sms_summary({}))
            return

        # Unknown API paths return JSON, not the HTML error page.
        if path.startswith("/api/"):
            self._send_json({"error": "Not found"}, status=404)
            return

        # static files
        if path in ("/", ""):
            path = "/index.html"
        safe_path = os.path.normpath(path).lstrip("/")
        full_path = os.path.realpath(os.path.join(STATIC_DIR, safe_path))
        if not full_path.startswith(os.path.realpath(STATIC_DIR) + os.sep) and full_path != os.path.realpath(STATIC_DIR):
            self.send_error(403, "Forbidden")
            return
        if not os.path.isfile(full_path):
            self.send_error(404, "Not found")
            return
        ext = os.path.splitext(full_path)[1]
        self._send_file(full_path, MIME_TYPES.get(ext, "application/octet-stream"))

    # ----- POST
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if not rate_ok(self._client_ip()):
            self._send_json({"error": "Too many requests"}, status=429)
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > MAX_BODY_BYTES:
            self._send_json({"error": "Request too large"}, status=413)
            return
        raw = self.rfile.read(length) if length else b""

        # SMS analyze accepts an uploaded XML file as raw request bytes
        # (frontend posts the file body directly). Everything else is JSON.
        if path == "/api/sms/analyze":
            if not self._is_authed():
                self._send_json({"error": "PIN required", "locked": True}, status=401)
                return
            with LOCK:
                self._send_json(self._sms_analyze(raw))
            return

        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        if not isinstance(data, dict):
            self._send_json({"error": "Invalid request body"}, status=400)
            return

        # Auth endpoints (always open)
        if path == "/api/auth/login":
            result, meta = self._login(data)
            if isinstance(meta, dict) and 'extra_headers' in meta:
                self._send_json(result, extra_headers=meta['extra_headers'])
            else:
                self._send_json(result, status=meta if isinstance(meta, int) else 200)
            return
        if path == "/api/auth/logout":
            self._send_json({"ok": True}, extra_headers=[
                ("Set-Cookie", "gp_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict")
            ])
            return

        if not self._is_authed():
            self._send_json({"error": "PIN required", "locked": True}, status=401)
            return

        if path == "/api/auth/set-pin":
            with LOCK:
                self._send_json(self._set_pin(data))
            return

        routes = {
            "/api/houses": self._add_house,
            "/api/houses/update": self._update_house,
            "/api/houses/delete": self._delete_house,
            "/api/houses/restore": self._restore_house,
            "/api/payments/toggle": self._toggle_payment,
            "/api/payments/update": self._update_payment,
            "/api/guard-payments/add": self._add_guard_payment,
            "/api/guard-payments/delete": self._delete_guard_payment,
            "/api/reminders/add": self._add_reminder,
            "/api/reminders/resolve": self._resolve_reminder,
            "/api/settings": self._save_settings_route,
            "/api/clear": self._clear_all_data,
            "/api/import": self._import_data,
            "/api/backup/create": self._create_backup_route,
            "/api/backup/restore": self._restore_backup_route,
            "/api/diagnostics/run": self._run_diagnostics,
            "/api/integrations/gdrive/save-client": self._gdrive_save_client,
            "/api/integrations/gdrive/connect": self._gdrive_connect,
            "/api/integrations/gdrive/disconnect": self._gdrive_disconnect,
            "/api/integrations/gdrive/backup-now": self._gdrive_backup_now,
            "/api/sms/analyze": self._sms_analyze_json,
            "/api/sms/review": self._sms_review,
            "/api/sms/apply": self._sms_apply,
            "/api/sms/preview": self._sms_preview,
            "/api/sms/revert": self._sms_revert,
            "/api/sms/aliases": self._sms_add_alias,
            "/api/sms/aliases/delete": self._sms_delete_alias,
            "/api/sms/suggest": self._sms_suggest,
        }
        handler = routes.get(path)
        if handler is None:
            self._send_json({"error": "Not found"}, status=404)
            return
        with LOCK:
            result = handler(data)
        self._send_json(result)

    def do_OPTIONS(self):
        self.send_response(204)
        self._security_headers()
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.end_headers()

    # ------------------------------------------------------------------ auth handlers
    def _auth_status(self):
        return {"pin_enabled": pin_enabled(), "authed": self._is_authed()}

    def _login(self, data):
        pin = str(data.get('pin', ''))
        conn = get_db()
        try:
            row = _auth_row(conn)
            if not row or not row['pin_enabled']:
                return {"ok": True}, 200  # nothing to do
            if verify_pin(conn, pin):
                conn.execute("UPDATE auth_secret SET last_verified_at=? WHERE id=1", (now_iso(),))
                write_audit(conn, 'pin', 'LOGIN', 'auth_secret', 1)
                conn.commit()
                token = make_session_token(row['session_secret'])
                cookie = f"gp_session={token}; Path=/; Max-Age={SESSION_MAX_AGE}; HttpOnly; SameSite=Strict"
                return {"ok": True}, {"extra_headers": [("Set-Cookie", cookie)]}
            write_audit(conn, 'anon', 'AUTH_FAIL', 'auth_secret', 1)
            conn.commit()
            return {"error": "Incorrect PIN"}, 401
        finally:
            conn.close()

    def _set_pin(self, data):
        pin = str(data.get('pin', '') or '')
        enable = data.get('enabled', True)
        conn = get_db()
        try:
            row = _auth_row(conn)
            # verify current pin if one is set
            if row and row['pin_enabled']:
                if not verify_pin(conn, str(data.get('current_pin', ''))):
                    return {"error": "Current PIN is incorrect"}
            if not enable:
                disable_pin(conn)
                write_audit(conn, 'pin', 'UPDATE', 'auth_secret', 1, after={"pin_enabled": 0})
                conn.commit()
                return {"ok": True, "pin_enabled": False}
            if len(pin) < 4 or len(pin) > 32 or not pin.isprintable():
                return {"error": "PIN must be 4-32 characters"}
            set_pin(conn, pin)
            write_audit(conn, 'pin', 'UPDATE', 'auth_secret', 1, after={"pin_enabled": 1})
            conn.commit()
            return {"ok": True, "pin_enabled": True}
        finally:
            conn.close()

    # ------------------------------------------------------------------ reads
    def _get_full_state(self):
        return {
            "settings": get_settings(),
            "houses": self._get_houses(include_inactive=True),
            "payments": self._get_payments(include_inactive=True),
            "guard_payments": self._get_guard_payments(),
            "fee_change": self._get_fee_changes(),
            "reminders": self._get_reminders(),
            "aliases": self._get_aliases(),
            "sms_pending": self._sms_pending_count(),
            "auth": {"pin_enabled": pin_enabled()},
        }

    def _get_aliases(self):
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT a.house_id, a.alias, h.name AS house_name, h.house_number "
                "FROM house_aliases a JOIN houses h ON h.id = a.house_id ORDER BY h.house_number"
            ).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _sms_pending_count(self):
        conn = get_db()
        try:
            row = conn.execute("SELECT COUNT(*) c FROM sms_candidates WHERE status='pending'").fetchone()
        except Exception:
            return 0
        finally:
            conn.close()
        return row['c'] if row else 0

    def _get_fee_changes(self):
        conn = get_db()
        try:
            rows = conn.execute("SELECT * FROM fee_change ORDER BY changed_at").fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_houses(self, include_inactive=False):
        conn = get_db()
        try:
            if include_inactive:
                rows = conn.execute(
                    "SELECT * FROM houses ORDER BY active DESC, CAST(house_number AS INTEGER), house_number"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM houses WHERE active=1 ORDER BY CAST(house_number AS INTEGER), house_number"
                ).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_payments(self, month=None, include_inactive=False):
        conn = get_db()
        try:
            if include_inactive:
                if month:
                    m, err = parse_month(month)
                    if err:
                        return []
                    rows = conn.execute("""
                        SELECT p.*, h.name AS house_name, h.house_number, h.fee
                        FROM payments p JOIN houses h ON p.house_id = h.id
                        WHERE p.month_key = ?
                    """, (m,)).fetchall()
                else:
                    rows = conn.execute("""
                        SELECT p.*, h.name AS house_name, h.house_number, h.fee
                        FROM payments p JOIN houses h ON p.house_id = h.id
                    """).fetchall()
            else:
                if month:
                    m, err = parse_month(month)
                    if err:
                        return []
                    rows = conn.execute("""
                        SELECT p.*, h.name AS house_name, h.house_number, h.fee
                        FROM payments p JOIN houses h ON p.house_id = h.id
                        WHERE p.month_key = ? AND h.active = 1
                    """, (m,)).fetchall()
                else:
                    rows = conn.execute("""
                        SELECT p.*, h.name AS house_name, h.house_number, h.fee
                        FROM payments p JOIN houses h ON p.house_id = h.id
                        WHERE h.active = 1
                    """).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_guard_payments(self):
        conn = get_db()
        try:
            rows = conn.execute("SELECT * FROM guard_payments ORDER BY month_key DESC").fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_reminders(self):
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT r.*, h.name AS house_name, h.house_number
                FROM house_reminder r JOIN houses h ON r.house_id = h.id
                WHERE r.is_active = 1 AND h.active = 1
                ORDER BY r.created_at DESC
            """).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_audit(self, limit):
        n, err = parse_int(limit, default=DEFAULT_AUDIT_LIMIT, min_val=1, max_val=MAX_AUDIT_LIMIT)
        if err:
            n = DEFAULT_AUDIT_LIMIT
        conn = get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (n,)
            ).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def _get_stats(self, month=None):
        settings = get_settings()
        due_day, _ = parse_int(settings.get('due_day', 5), default=5)
        currency = settings.get('currency', 'ETB')
        conn = get_db()
        try:
            houses = conn.execute("SELECT * FROM houses WHERE active=1").fetchall()
            today = date.today()
            if month:
                m, err = parse_month(month)
                if err:
                    return {"error": err}
                year, mon = map(int, m.split('-'))
                current_month = m
            else:
                year, mon = today.year, today.month
                current_month = f"{year}-{mon:02d}"
            payments = conn.execute("""
                SELECT p.*, h.fee FROM payments p
                JOIN houses h ON p.house_id = h.id
                WHERE p.month_key = ? AND h.active = 1
            """, (current_month,)).fetchall()
        finally:
            conn.close()

        payments_dict = {p['house_id']: dict(p) for p in payments}
        total_houses = len(houses)
        paid_count = total_collected = total_expected = late_count = on_time_count = 0
        import calendar
        last_day = calendar.monthrange(year, mon)[1]
        due_date = date(year, mon, min(due_day or 5, last_day))

        for house in houses:
            total_expected += house['fee']
            payment = payments_dict.get(house['id'])
            if payment and payment['paid_date']:
                paid_count += 1
                total_collected += payment['amount'] or house['fee']
                try:
                    pd = date.fromisoformat(payment['paid_date'])
                    if (pd - due_date).days <= 0:
                        on_time_count += 1
                    else:
                        late_count += 1
                except (ValueError, OverflowError):
                    late_count += 1

        return {
            "total_houses": total_houses,
            "paid_count": paid_count,
            "unpaid_count": total_houses - paid_count,
            "total_collected": total_collected,
            "total_expected": total_expected,
            "completion_pct": round(paid_count / total_houses * 100) if total_houses else 0,
            "on_time_count": on_time_count,
            "late_count": late_count,
            "currency": currency,
            "month": current_month,
        }

    def _list_backups(self):
        # NOTE: this previously raised NameError on every call (BACKUP_DIR and
        # datetime were used here but never imported) — the backup list was
        # completely broken. Fixed by importing both at the top of this file.
        ensure_backup_dir()
        out = []
        for f in os.listdir(BACKUP_DIR):
            if f.startswith('guardpay-') and f.endswith('.db'):
                p = os.path.join(BACKUP_DIR, f)
                out.append({"file": f, "size": os.path.getsize(p),
                            "modified": datetime.fromtimestamp(os.path.getmtime(p)).isoformat(timespec='seconds')})
        out.sort(key=lambda x: x['modified'], reverse=True)
        return out

    # ------------------------------------------------------------------ writes
    def _add_house(self, data):
        name = str(data.get('name', '')).strip()
        house_number = str(data.get('house_number', '')).strip()
        fee, err = parse_int(data.get('fee', int(DEFAULT_HOUSE_FEE)), min_val=0)
        if err:
            return {"error": f"Fee {err}"}
        notes = str(data.get('notes', ''))
        if not name or not house_number:
            return {"error": "Name and house number are required"}
        today = date.today()
        created_month = f"{today.year}-{today.month:02d}"
        ts = now_iso()
        conn = get_db()
        try:
            cur = conn.execute(
                "INSERT INTO houses (name, house_number, fee, notes, created_month, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (name, house_number, fee, notes, created_month, ts, ts)
            )
            hid = cur.lastrowid
            write_audit(conn, self._actor(), 'CREATE', 'houses', hid,
                        after={"name": name, "house_number": house_number, "fee": fee})
            conn.commit()
            return {"ok": True, "id": hid}
        except sqlite3.IntegrityError:
            return {"error": f"House number {house_number} already exists"}
        finally:
            conn.close()

    def _update_house(self, data):
        house_id = data.get('id')
        name = str(data.get('name', '')).strip()
        house_number = str(data.get('house_number', '')).strip()
        fee, err = parse_int(data.get('fee', int(DEFAULT_HOUSE_FEE)), min_val=0)
        if err:
            return {"error": f"Fee {err}"}
        notes = str(data.get('notes', ''))
        if not house_id or not name or not house_number:
            return {"error": "Missing required fields"}
        conn = get_db()
        try:
            old = conn.execute("SELECT * FROM houses WHERE id=?", (house_id,)).fetchone()
            if not old:
                return {"error": "House not found"}
            ts = now_iso()
            if old['fee'] != fee:
                conn.execute(
                    "INSERT INTO fee_change (house_id, old_fee, new_fee, changed_at, note) VALUES (?, ?, ?, ?, ?)",
                    (house_id, old['fee'], fee, ts, 'fee updated')
                )
            active = data.get('active', old['active'])
            notes_val = notes if notes else ''
            if active and not old['active']:
                # restoring: clear deleted_at
                conn.execute(
                    "UPDATE houses SET name=?, house_number=?, fee=?, notes=?, active=?, deleted_at=NULL, updated_at=? WHERE id=?",
                    (name, house_number, fee, notes_val, 1, ts, house_id)
                )
            else:
                try:
                    conn.execute(
                        "UPDATE houses SET name=?, house_number=?, fee=?, notes=?, active=?, updated_at=? WHERE id=?",
                        (name, house_number, fee, notes_val, 1 if active else 0, ts, house_id)
                    )
                except sqlite3.IntegrityError:
                    return {"error": f"House number {house_number} already exists"}
            if not active and old['active']:
                conn.execute("UPDATE house_reminder SET is_active=0, reminded_at=? WHERE house_id=? AND is_active=1",
                             (ts, house_id))
            write_audit(conn, self._actor(), 'UPDATE', 'houses', house_id,
                        before=dict(old),
                        after={"name": name, "house_number": house_number, "fee": fee, "notes": notes, "active": bool(active)})
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _delete_house(self, data):
        house_id = data.get('id')
        if not house_id:
            return {"error": "Missing house id"}
        maybe_backup_before_change()
        conn = get_db()
        try:
            old = conn.execute("SELECT * FROM houses WHERE id=?", (house_id,)).fetchone()
            if not old:
                return {"error": "House not found"}
            if old['active']:
                conn.execute("UPDATE houses SET active=0, deleted_at=?, updated_at=? WHERE id=?",
                             (now_iso(), now_iso(), house_id))
                conn.execute("UPDATE house_reminder SET is_active=0, reminded_at=? WHERE house_id=? AND is_active=1",
                             (now_iso(), house_id))
            else:
                return {"error": "House already deleted"}
            write_audit(conn, self._actor(), 'DELETE', 'houses', house_id, before=dict(old))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _restore_house(self, data):
        house_id = data.get('id')
        if not house_id:
            return {"error": "Missing house id"}
        conn = get_db()
        try:
            old = conn.execute("SELECT * FROM houses WHERE id=? AND active=0", (house_id,)).fetchone()
            if not old:
                return {"error": "House not found or already active"}
            # avoid unique-number clash with an active house
            clash = conn.execute("SELECT 1 FROM houses WHERE house_number=? AND active=1 AND id<>?",
                                 (old['house_number'], house_id)).fetchone()
            if clash:
                return {"error": f"House number {old['house_number']} is now used by another active house"}
            conn.execute("UPDATE houses SET active=1, deleted_at=NULL, updated_at=? WHERE id=?",
                         (now_iso(), house_id))
            write_audit(conn, self._actor(), 'RESTORE', 'houses', house_id, after=dict(old))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _toggle_payment(self, data):
        house_id = data.get('house_id')
        month_key = data.get('month_key')
        paid_date = data.get('paid_date')
        if not house_id or not month_key:
            return {"error": "Missing house_id or month_key"}
        mk, err = parse_month(month_key)
        if err:
            return {"error": f"Month {err}"}
        if paid_date:
            pd, err = parse_date(paid_date)
            if err:
                return {"error": f"Paid date {err}"}
        conn = get_db()
        try:
            house = conn.execute("SELECT fee FROM houses WHERE id=?", (house_id,)).fetchone()
            if not house:
                return {"error": "House not found"}
            ts = now_iso()
            existing = conn.execute(
                "SELECT * FROM payments WHERE house_id=? AND month_key=?", (house_id, mk)
            ).fetchone()
            if existing and existing['paid_date']:
                conn.execute(
                    "UPDATE payments SET paid_date=NULL, amount=0, updated_at=? WHERE house_id=? AND month_key=?",
                    (ts, house_id, mk)
                )
                write_audit(conn, self._actor(), 'UPDATE', 'payments', existing['id'],
                            before=dict(existing), after={"paid": False, "month_key": mk})
                conn.commit()
                return {"ok": True, "paid": False}
            actual_date = paid_date or date.today().isoformat()
            if existing:
                conn.execute(
                    "UPDATE payments SET paid_date=?, amount=?, updated_at=? WHERE house_id=? AND month_key=?",
                    (actual_date, house['fee'], ts, house_id, mk)
                )
                pid = existing['id']
            else:
                cur = conn.execute(
                    "INSERT INTO payments (house_id, month_key, paid_date, amount, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (house_id, mk, actual_date, house['fee'], ts, ts)
                )
                pid = cur.lastrowid
            write_audit(conn, self._actor(), 'UPDATE', 'payments', pid,
                        after={"paid": True, "month_key": mk, "amount": house['fee']})
            conn.commit()
            return {"ok": True, "paid": True}
        finally:
            conn.close()

    def _update_payment(self, data):
        house_id = data.get('house_id')
        month_key = data.get('month_key')
        paid_date = data.get('paid_date')
        amount = data.get('amount')
        note = str(data.get('note', ''))
        if not house_id or not month_key:
            return {"error": "Missing required fields"}
        mk, err = parse_month(month_key)
        if err:
            return {"error": f"Month {err}"}
        if paid_date:
            paid_date, err = parse_date(paid_date)
            if err:
                return {"error": f"Paid date {err}"}
        if amount is not None:
            amount, err = parse_int(amount, min_val=0)
            if err:
                return {"error": f"Amount {err}"}
        else:
            amount = 0
        conn = get_db()
        try:
            house = conn.execute("SELECT id FROM houses WHERE id=? AND active=1", (house_id,)).fetchone()
            if not house:
                return {"error": "House not found"}
            ts = now_iso()
            if paid_date:
                conn.execute("""
                    INSERT INTO payments (house_id, month_key, paid_date, amount, note, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(house_id, month_key)
                    DO UPDATE SET paid_date=excluded.paid_date, amount=excluded.amount, note=excluded.note, updated_at=excluded.updated_at
                """, (house_id, mk, paid_date, amount, note, ts, ts))
            else:
                conn.execute("""
                    INSERT INTO payments (house_id, month_key, paid_date, amount, note, created_at, updated_at)
                    VALUES (?, ?, NULL, 0, ?, ?, ?)
                    ON CONFLICT(house_id, month_key)
                    DO UPDATE SET paid_date=NULL, amount=0, note=excluded.note, updated_at=excluded.updated_at
                """, (house_id, mk, note, ts, ts))
            write_audit(conn, self._actor(), 'UPDATE', 'payments', None,
                        after={"house_id": house_id, "month_key": mk, "paid_date": paid_date, "amount": amount})
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _add_guard_payment(self, data):
        month_key = data.get('month_key')
        mk, err = parse_month(month_key or '')
        if err:
            return {"error": f"Month {err}"}
        paid_date = data.get('paid_date', date.today().isoformat())
        pd, err = parse_date(paid_date)
        if err:
            return {"error": f"Paid date {err}"}
        amount, err = parse_int(data.get('amount', 0), min_val=0)
        if err:
            return {"error": f"Amount {err}"}
        method = str(data.get('method', 'transfer'))
        if method not in GUARD_METHODS:
            method = 'transfer'
        note = str(data.get('note', ''))
        conn = get_db()
        try:
            ts = now_iso()
            existing = conn.execute("SELECT * FROM guard_payments WHERE month_key=?", (mk,)).fetchone()
            if existing:
                conn.execute(
                    "UPDATE guard_payments SET paid_date=?, amount=?, method=?, note=?, updated_at=? WHERE month_key=?",
                    (pd, amount, method, note, ts, mk)
                )
                write_audit(conn, self._actor(), 'UPDATE', 'guard_payments', existing['id'],
                            before=dict(existing), after={"amount": amount, "method": method})
            else:
                cur = conn.execute(
                    "INSERT INTO guard_payments (month_key, paid_date, amount, method, note, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (mk, pd, amount, method, note, ts, ts)
                )
                write_audit(conn, self._actor(), 'CREATE', 'guard_payments', cur.lastrowid,
                            after={"month_key": mk, "amount": amount, "method": method})
            conn.commit()
            return {"ok": True}
        except Exception:
            return {"error": "Failed to save guard payment"}
        finally:
            conn.close()

    def _delete_guard_payment(self, data):
        month_key = data.get('month_key')
        if not month_key:
            return {"error": "Missing month_key"}
        mk, err = parse_month(month_key)
        if err:
            return {"error": f"Month {err}"}
        conn = get_db()
        try:
            old = conn.execute("SELECT * FROM guard_payments WHERE month_key=?", (mk,)).fetchone()
            if not old:
                return {"error": "No guard payment for that month"}
            conn.execute("DELETE FROM guard_payments WHERE month_key=?", (mk,))
            write_audit(conn, self._actor(), 'DELETE', 'guard_payments', old['id'], before=dict(old))
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _add_reminder(self, data):
        house_id = data.get('house_id')
        note = str(data.get('note', ''))
        if not house_id:
            return {"error": "Missing house_id"}
        conn = get_db()
        try:
            house = conn.execute("SELECT id FROM houses WHERE id=? AND active=1", (house_id,)).fetchone()
            if not house:
                return {"error": "House not found"}
            existing = conn.execute(
                "SELECT id FROM house_reminder WHERE house_id=? AND is_active=1", (house_id,)
            ).fetchone()
            if existing:
                conn.execute("UPDATE house_reminder SET note=? WHERE id=?", (note, existing['id']))
                rid = existing['id']
            else:
                cur = conn.execute(
                    "INSERT INTO house_reminder (house_id, is_active, note, created_at) VALUES (?, 1, ?, ?)",
                    (house_id, note, now_iso())
                )
                rid = cur.lastrowid
            write_audit(conn, self._actor(), 'CREATE', 'house_reminder', rid, after={"house_id": house_id})
            conn.commit()
            return {"ok": True, "id": rid}
        finally:
            conn.close()

    def _resolve_reminder(self, data):
        house_id = data.get('house_id')
        rid = data.get('id')
        conn = get_db()
        try:
            if rid:
                row = conn.execute("SELECT * FROM house_reminder WHERE id=?", (rid,)).fetchone()
            elif house_id:
                row = conn.execute(
                    "SELECT * FROM house_reminder WHERE house_id=? AND is_active=1", (house_id,)
                ).fetchone()
            else:
                return {"error": "Missing id or house_id"}
            if not row:
                return {"error": "Reminder not found"}
            conn.execute("UPDATE house_reminder SET is_active=0, reminded_at=? WHERE id=?",
                         (now_iso(), row['id']))
            write_audit(conn, self._actor(), 'UPDATE', 'house_reminder', row['id'], after={"is_active": 0})
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _save_settings_route(self, data):
        clean, err = validate_settings(data)
        if err:
            return {"error": err}
        conn = get_db()
        try:
            before = {r['key']: r['value'] for r in conn.execute("SELECT key, value FROM settings").fetchall()}
            save_settings(conn, clean)
            write_audit(conn, self._actor(), 'UPDATE', 'settings', None,
                        before={k: before.get(k) for k in clean}, after=clean)
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _create_backup_route(self, data):
        try:
            path = create_backup('manual')
            conn = get_db()
            try:
                write_audit(conn, self._actor(), 'EXPORT', 'backup', None, after={"file": os.path.basename(path)})
                conn.commit()
            finally:
                conn.close()
            return {"ok": True, "file": os.path.basename(path)}
        except Exception as e:
            LOGGER.exception("backup create failed")
            return {"error": f"Backup failed: {e}"}

    def _restore_backup_route(self, data):
        filename = str(data.get('file', '') or '')
        if not filename:
            return {"error": "No backup file specified"}
        try:
            restore_backup(filename)
        except ValueError as e:
            return {"error": str(e)}
        except Exception as e:
            LOGGER.exception("restore failed")
            return {"error": f"Restore failed: {e}"}
        # Written AFTER the restore, so it lands in the now-current (restored) history —
        # a visible marker of "this is where the data got swapped in from a backup".
        conn = get_db()
        try:
            write_audit(conn, self._actor(), 'RESTORE', 'backup', None, after={"file": os.path.basename(filename)})
            conn.commit()
        finally:
            conn.close()
        return {"ok": True}

    def _send_backup_file(self, filename):
        try:
            full_path, safe_name = backup_file_path(filename)
        except ValueError as e:
            self.send_error(404, str(e))
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", f"attachment; filename={safe_name}")
        self.send_header("Content-Length", str(os.path.getsize(full_path)))
        self._security_headers()
        self.end_headers()
        with open(full_path, 'rb') as f:
            self.wfile.write(f.read())

    def _run_diagnostics(self, data):
        result = run_self_test()
        result['log_tail'] = tail_log(200)
        return result

    # ------------------------------------------------------------------ google drive
    def _gdrive_save_client(self, data):
        try:
            gdrive.save_client(data.get('client_id', ''), data.get('client_secret', ''))
            return {"ok": True}
        except ValueError as e:
            return {"error": str(e)}

    def _gdrive_connect(self, data):
        port = self.server.server_address[1]
        redirect_uri = f"http://localhost:{port}/api/integrations/gdrive/callback"
        try:
            url = gdrive.build_auth_url(redirect_uri)
            return {"ok": True, "url": url}
        except ValueError as e:
            return {"error": str(e)}

    def _gdrive_disconnect(self, data):
        gdrive.disconnect()
        return {"ok": True}

    def _gdrive_backup_now(self, data):
        try:
            path = create_backup('gdrive')
            result = gdrive.upload_file(path)
            conn = get_db()
            try:
                write_audit(conn, self._actor(), 'EXPORT', 'gdrive_backup', None,
                             after={"name": result.get('name')})
                conn.commit()
            finally:
                conn.close()
            return {"ok": True, "file": result.get('name')}
        except ValueError as e:
            return {"error": str(e)}
        except urllib.error.HTTPError as e:
            LOGGER.error("gdrive upload HTTP error: %s %s", e.code, e.reason)
            return {"error": f"Google Drive rejected the request ({e.code}). Try reconnecting."}
        except Exception as e:
            LOGGER.exception("gdrive backup failed")
            return {"error": f"Google Drive backup failed: {e}"}

    def _gdrive_callback(self, params):
        code = params.get('code', [None])[0]
        error = params.get('error', [None])[0]
        port = self.server.server_address[1]
        redirect_uri = f"http://localhost:{port}/api/integrations/gdrive/callback"
        if error:
            html = ("<html><body style='font-family:sans-serif;padding:40px'>"
                    f"<h2>Connection cancelled</h2><p>{error}</p><p>You can close this tab.</p></body></html>")
        elif code:
            try:
                with LOCK:
                    gdrive.exchange_code(code, redirect_uri)
                html = ("<html><body style='font-family:sans-serif;padding:40px'>"
                        "<h2>Google Drive connected</h2><p>You can close this tab and go back to GuardPay.</p></body></html>")
            except Exception as e:
                LOGGER.exception("gdrive callback exchange failed")
                html = (f"<html><body style='font-family:sans-serif;padding:40px'>"
                        f"<h2>Connection failed</h2><p>{e}</p></body></html>")
        else:
            html = "<html><body style='font-family:sans-serif;padding:40px'><h2>No authorization code received</h2></body></html>"
        body = html.encode('utf-8')
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _clear_all_data(self, data):
        maybe_backup_before_change()
        try:
            create_backup('preclear')
        except Exception:
            pass
        conn = get_db()
        try:
            conn.execute("BEGIN")
            conn.execute("DELETE FROM house_reminder")
            conn.execute("DELETE FROM fee_change")
            conn.execute("DELETE FROM payments")
            conn.execute("DELETE FROM guard_payments")
            conn.execute("DELETE FROM houses")
            conn.execute("DELETE FROM settings")
            conn.execute("DELETE FROM auth_secret")
            conn.execute("DELETE FROM audit_log")
            conn.execute("DELETE FROM integrations")
            conn.execute("DELETE FROM attachment")
            write_audit(conn, self._actor(), 'DELETE', 'all', None)
            conn.commit()
            return {"ok": True}
        except Exception:
            conn.rollback()
            return {"error": "Clear failed — no changes made"}
        finally:
            conn.close()

    def _import_data(self, data):
        if not data or 'houses' not in data or not isinstance(data.get('houses'), list):
            return {"error": "Invalid import data — 'houses' list required"}
        houses = data.get('houses', [])
        payments = data.get('payments', []) or []
        guard_payments = data.get('guard_payments', []) or []
        fee_changes = data.get('fee_change', []) or []
        reminders = data.get('reminders', []) or []

        # Validate everything BEFORE touching the DB
        for i, h in enumerate(houses):
            if not isinstance(h, dict) or not str(h.get('name', '')).strip() or not str(h.get('house_number', '')).strip():
                return {"error": f"House #{i+1} missing name or house_number"}
            _, e = parse_int(h.get('fee', int(DEFAULT_HOUSE_FEE)), min_val=0)
            if e:
                return {"error": f"House #{i+1} fee {e}"}
        house_ids = {h.get('id') for h in houses if isinstance(h, dict) and h.get('id')}
        for i, p in enumerate(payments):
            if not isinstance(p, dict) or 'house_id' not in p or not p.get('month_key'):
                return {"error": f"Payment #{i+1} missing house_id or month_key"}
            if p.get('house_id') not in house_ids:
                return {"error": f"Payment #{i+1} references house_id {p.get('house_id')} which is not in imported houses"}
            _, e = parse_month(str(p.get('month_key')))
            if e:
                return {"error": f"Payment #{i+1} month {e}"}
            if p.get('paid_date'):
                _, e = parse_date(str(p.get('paid_date')))
                if e:
                    return {"error": f"Payment #{i+1} paid_date {e}"}
        for i, g in enumerate(guard_payments):
            if not isinstance(g, dict) or not g.get('month_key') or not g.get('paid_date'):
                return {"error": f"Guard payment #{i+1} missing month_key or paid_date"}
            _, e = parse_month(str(g.get('month_key')))
            if e:
                return {"error": f"Guard payment #{i+1} month {e}"}

        maybe_backup_before_change()
        # Safety snapshot before any wipe, always
        try:
            create_backup('preimport')
        except Exception:
            pass

        conn = get_db()
        try:
            conn.execute("BEGIN")
            counts_before = {
                "houses": conn.execute("SELECT COUNT(*) c FROM houses").fetchone()['c'],
                "payments": conn.execute("SELECT COUNT(*) c FROM payments").fetchone()['c'],
            }
            conn.execute("DELETE FROM house_reminder")
            conn.execute("DELETE FROM fee_change")
            conn.execute("DELETE FROM payments")
            conn.execute("DELETE FROM guard_payments")
            conn.execute("DELETE FROM houses")
            ts = now_iso()
            for h in houses:
                fee, _ = parse_int(h.get('fee', int(DEFAULT_HOUSE_FEE)), default=int(DEFAULT_HOUSE_FEE), min_val=0)
                conn.execute(
                    "INSERT INTO houses (id, name, house_number, fee, notes, active, created_month, created_at, updated_at, deleted_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (h.get('id'), str(h['name']).strip(), str(h['house_number']).strip(), fee,
                     str(h.get('notes', '')), int(h.get('active', 1)),
                     h.get('created_month', ts[:7]), h.get('created_at', ts), h.get('updated_at', ts),
                     h.get('deleted_at'))
                )
            for p in payments:
                amt, _ = parse_int(p.get('amount', 0), default=0, min_val=0)
                conn.execute(
                    "INSERT INTO payments (house_id, month_key, paid_date, amount, note, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (p['house_id'], p['month_key'], p.get('paid_date'), amt,
                     str(p.get('note', '')), p.get('created_at', ts), p.get('updated_at', ts))
                )
            for g in guard_payments:
                amt, _ = parse_int(g.get('amount', 0), default=0, min_val=0)
                method = g.get('method', 'transfer')
                if method not in GUARD_METHODS:
                    method = 'transfer'
                conn.execute(
                    "INSERT INTO guard_payments (month_key, paid_date, amount, method, note, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (g['month_key'], g['paid_date'], amt, method,
                     str(g.get('note', '')), g.get('created_at', ts), g.get('updated_at', ts))
                )
            for fc in fee_changes:
                if isinstance(fc, dict) and fc.get('house_id') and fc.get('new_fee') is not None:
                    conn.execute(
                        "INSERT INTO fee_change (house_id, old_fee, new_fee, changed_at, note) VALUES (?, ?, ?, ?, ?)",
                        (fc['house_id'], fc.get('old_fee'), fc['new_fee'], fc.get('changed_at', ts), str(fc.get('note', '')))
                    )
            for r in reminders:
                if isinstance(r, dict) and r.get('house_id'):
                    conn.execute(
                        "INSERT INTO house_reminder (house_id, is_active, note, created_at, reminded_at) VALUES (?, ?, ?, ?, ?)",
                        (r['house_id'], int(r.get('is_active', 1)), str(r.get('note', '')),
                         r.get('created_at', ts), r.get('reminded_at'))
                    )
            audit_log_rows = data.get('audit_log', []) or []
            for al in audit_log_rows:
                if isinstance(al, dict):
                    conn.execute(
                        "INSERT INTO audit_log (actor, action, entity, entity_id, before_json, after_json, created_at) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (al.get('actor', 'import'), al.get('action', 'IMPORT'), al.get('entity', 'all'),
                         al.get('entity_id'), al.get('before_json'), al.get('after_json'),
                         al.get('created_at', ts))
                    )
            if isinstance(data.get('settings'), dict):
                clean, _serr = validate_settings(data['settings'])
                if clean:
                    save_settings(conn, clean)
            write_audit(conn, self._actor(), 'IMPORT', 'all', None,
                        before=counts_before,
                        after={"houses": len(houses), "payments": len(payments)})
            conn.commit()
            return {"ok": True, "imported": {"houses": len(houses), "payments": len(payments)}}
        except Exception:
            conn.rollback()
            return {"error": "Import failed — no changes were made (a safety backup was saved)"}
        finally:
            conn.close()

    # ------------------------------------------------------------------ SMS import
    def _sms_analyze_json(self, data):
        # Unused JSON variant — raw-file upload is handled directly in do_POST.
        return {"error": "Upload the XML file, not JSON"}

    def _sms_analyze(self, raw):
        if not raw:
            return {"error": "No XML data received"}
        conn = get_db()
        try:
            houses = conn.execute(
                "SELECT id, name, house_number, fee, active FROM houses"
            ).fetchall()
            aliases = conn.execute("SELECT house_id, alias FROM house_aliases").fetchall()
        finally:
            conn.close()
        settings = get_settings()
        try:
            result = sms_import.analyze(raw, settings, [dict(h) for h in houses],
                                        [dict(a) for a in aliases])
        except Exception as e:
            LOGGER.exception("sms analyze failed")
            return {"error": f"Failed to parse XML: {e}"}

        ts = now_iso()
        conn = get_db()
        try:
            conn.execute("DELETE FROM sms_candidates WHERE status = 'pending'")
            for c in result['candidates']:
                conn.execute("""
                    INSERT OR IGNORE INTO sms_candidates
                    (bank, account_last4, direction, amount, balance, txn_date, txn_ts,
                     ref_no, payer_raw, matched_house_id, months, month_from, confidence,
                     status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                """, (c['bank'], c['account_last4'], 'credit', c['amount'], c['balance'],
                      c['txn_date'], c['txn_ts'], c['ref_no'], c['payer_raw'],
                      c['matched_house_id'], c['months'], '', c['confidence'], ts, ts))
            conn.commit()
        finally:
            conn.close()
        return {
            "summary": result['summary'],
            "candidates": self._sms_review_list()['candidates'],
            "name_pool": result['name_pool'],
        }

    def _sms_review_list(self):
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT c.*, h.name AS house_name, h.house_number
                FROM sms_candidates c
                LEFT JOIN houses h ON h.id = c.matched_house_id
                WHERE c.status = 'pending'
                ORDER BY c.txn_date, c.txn_ts
            """).fetchall()
            houses = conn.execute(
                "SELECT id, name, house_number, fee, active FROM houses"
            ).fetchall()
            aliases = conn.execute("SELECT house_id, alias FROM house_aliases").fetchall()
        finally:
            conn.close()
        out = []
        for r in rows:
            d = dict(r)
            d['suggestions'] = []
            if not d.get('payer_raw') or not d.get('matched_house_id'):
                d['suggestions'] = sms_import.suggest_houses(
                    d.get('payer_raw') or '', [dict(h) for h in houses],
                    [dict(a) for a in aliases])
            out.append(d)
        return {"candidates": out}

    def _sms_name_pool(self):
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT payer_raw, COUNT(*) AS n, GROUP_CONCAT(amount) AS amounts
                FROM sms_candidates
                WHERE payer_raw != '' AND status = 'pending'
                GROUP BY payer_raw
                ORDER BY n DESC
            """).fetchall()
        finally:
            conn.close()
        return [{
            "name": r['payer_raw'],
            "count": r['n'],
            "amounts": sorted({int(a) for a in (r['amounts'] or '').split(',') if a.isdigit()}),
        } for r in rows]

    def _sms_review(self, data):
        updates = data.get('updates')
        if not isinstance(updates, list) or not updates:
            return {"error": "No updates provided"}
        conn = get_db()
        try:
            ts = now_iso()
            done = []
            for u in updates:
                cid = u.get('id')
                if not cid:
                    continue
                row = conn.execute("SELECT * FROM sms_candidates WHERE id=?", (cid,)).fetchone()
                if not row or row['status'] not in ('pending', 'approved', 'rejected'):
                    continue
                status = u.get('status')
                house_id = u.get('matched_house_id')
                months = u.get('months')
                month_from = (u.get('month_from') or '')
                if status not in ('approved', 'rejected'):
                    status = row['status']
                if house_id is None:
                    house_id = row['matched_house_id']
                if months is not None:
                    months = max(1, min(int(months), 36))
                else:
                    months = row['months']
                if month_from:
                    mf, err = parse_month(month_from)
                    if err:
                        return {"error": f"Month {err}"}
                else:
                    mf = row['month_from']
                if status == 'approved' and house_id:
                    h = conn.execute(
                        "SELECT id FROM houses WHERE id=? AND active=1", (house_id,)
                    ).fetchone()
                    if not h:
                        return {"error": f"Candidate {cid}: house not found or inactive"}
                note = u.get('note')
                if note is not None:
                    note = str(note)[:500]
                else:
                    note = row['note']
                is_dup = u.get('is_duplicate')
                if is_dup is not None:
                    is_dup = 1 if is_dup else 0
                else:
                    is_dup = row['is_duplicate']
                amount = u.get('amount')
                if amount is not None:
                    try:
                        amount = int(amount)
                    except (TypeError, ValueError):
                        return {"error": f"Candidate {cid}: invalid amount"}
                    if amount < 0:
                        return {"error": f"Candidate {cid}: invalid amount"}
                else:
                    amount = row['amount']
                conn.execute("""
                    UPDATE sms_candidates
                    SET status=?, matched_house_id=?, months=?, month_from=?,
                        note=?, is_duplicate=?, amount=?, updated_at=?
                    WHERE id=?
                """, (status, house_id, months, mf, note, is_dup, amount, ts, cid))
                done.append(cid)
            conn.commit()
            write_audit(conn, self._actor(), 'UPDATE', 'sms_candidates', None,
                        after={"updated": len(done)})
            conn.commit()
        finally:
            conn.close()
        return {"ok": True, "updated": len(done), **self._sms_review_list()}

    def _sms_apply(self, data):
        maybe_backup_before_change()
        try:
            create_backup('preimport')
        except Exception:
            pass
        conn = get_db()
        applied = 0
        skipped = []
        try:
            conn.execute("BEGIN")
            rows = conn.execute("""
                SELECT c.*, h.fee AS house_fee, h.id AS hid
                FROM sms_candidates c
                JOIN houses h ON h.id = c.matched_house_id
                WHERE c.status='approved' AND c.matched_house_id IS NOT NULL
                ORDER BY c.txn_ts
            """).fetchall()
            ts = now_iso()
            for row in rows:
                if row['is_duplicate']:
                    conn.execute("UPDATE sms_candidates SET status='rejected', updated_at=? WHERE id=?",
                                 (ts, row['id']))
                    skipped.append(row['id'])
                    continue
                month_from = row['month_from'] or sms_import.month_of(row['txn_date'])
                months = max(1, row['months'] or 1)
                amount = row['house_fee'] if months > 1 else row['amount']
                for i in range(months):
                    mk = sms_import.add_months(month_from, i)
                    conn.execute("""
                        INSERT INTO payments (house_id, month_key, paid_date, amount,
                                              note, sms_source_id, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(house_id, month_key)
                        DO UPDATE SET paid_date=excluded.paid_date, amount=excluded.amount,
                                      sms_source_id=excluded.sms_source_id, updated_at=excluded.updated_at
                    """, (row['hid'], mk, row['txn_date'], amount, row['note'], row['id'], ts, ts))
                conn.execute(
                    "UPDATE sms_candidates SET status='applied', updated_at=? WHERE id=?",
                    (ts, row['id'])
                )
                applied += 1
            # finalise any rejected/unassigned as rejected if requested
            conn.execute("UPDATE sms_candidates SET status='rejected', updated_at=? "
                         "WHERE status='approved' AND (matched_house_id IS NULL)", (ts,))
            write_audit(conn, self._actor(), 'CREATE', 'payments', None,
                        after={"from_sms": applied})
            conn.commit()
        except Exception as e:
            conn.rollback()
            LOGGER.exception("sms apply failed")
            return {"error": f"Apply failed — no changes made: {e}"}
        finally:
            conn.close()
        return {"ok": True, "applied": applied, "skipped": skipped}

    def _sms_summary(self, data):
        """Counts + money totals by state / confidence / matched, and progress."""
        conn = get_db()
        try:
            by_status = conn.execute(
                "SELECT status, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amt, "
                "SUM(is_duplicate) AS dups FROM sms_candidates GROUP BY status").fetchall()
            by_conf = conn.execute(
                "SELECT confidence, COUNT(*) AS n, COALESCE(SUM(amount),0) AS amt "
                "FROM sms_candidates GROUP BY confidence").fetchall()
            total = conn.execute(
                "SELECT COUNT(*) AS n, COALESCE(SUM(amount),0) AS amt FROM sms_candidates").fetchone()
            matched = conn.execute(
                "SELECT COUNT(*) AS n FROM sms_candidates "
                "WHERE matched_house_id IS NOT NULL AND status='pending'").fetchone()
        finally:
            conn.close()
        status_rows = {r['status']: {'n': r['n'], 'amt': r['amt']} for r in by_status}
        conf_rows = {r['confidence']: {'n': r['n'], 'amt': r['amt']} for r in by_conf}
        pending = status_rows.get('pending', {'n': 0, 'amt': 0})
        done = status_rows.get('applied', {'n': 0, 'amt': 0})['n']
        done += status_rows.get('rejected', {'n': 0, 'amt': 0})['n']
        denom = (status_rows.get('pending', {'n': 0})['n']
                 + status_rows.get('approved', {'n': 0})['n'] + done)
        progress = round(done / denom * 100, 1) if denom else 0.0
        return {
            "total": total['n'], "total_amt": total['amt'],
            "by_status": status_rows, "by_confidence": conf_rows,
            "pending_amt": pending['amt'],
            "matched": matched['n'] if matched else 0,
            "progress": progress,
        }

    def _sms_preview(self, data):
        """Dry-run of apply: what will post, and which payments would be overwritten."""
        conn = get_db()
        try:
            rows = conn.execute("""
                SELECT c.id, c.amount, c.txn_date, c.months, c.month_from, c.note,
                       c.matched_house_id, c.is_duplicate,
                       h.name AS house_name, h.house_number, h.fee AS house_fee
                FROM sms_candidates c
                JOIN houses h ON h.id = c.matched_house_id
                WHERE c.status='approved' AND c.matched_house_id IS NOT NULL
                ORDER BY c.txn_ts
            """).fetchall()
            existing = {
                (r['house_id'], r['month_key']) for r in conn.execute(
                    "SELECT house_id, month_key FROM payments").fetchall()
            }
        finally:
            conn.close()
        plan, conflicts = [], []
        for row in rows:
            if row['is_duplicate']:
                continue
            month_from = row['month_from'] or sms_import.month_of(row['txn_date'])
            months = max(1, row['months'] or 1)
            amount = row['house_fee'] if months > 1 else row['amount']
            covered = [sms_import.add_months(month_from, i) for i in range(months)]
            cid = row['id']
            post = {
                'id': cid, 'amount_per_month': amount, 'months': months,
                'month_from': month_from, 'covered': covered,
                'house_id': row['matched_house_id'],
                'house_name': row['house_name'], 'house_number': row['house_number'],
            }
            for mk in covered:
                if (row['matched_house_id'], mk) in existing:
                    conflicts.append({'candidate_id': cid, 'month_key': mk,
                                      'house_name': row['house_name']})
            plan.append(post)
        return {"ok": True, "plan": plan, "conflicts": conflicts,
                "note": ("existing payments would be overwritten" if conflicts else "")}

    def _sms_revert(self, data):
        """Undo an applied batch: delete the payments it created and flip back to approved."""
        ids = data.get('ids')
        if not isinstance(ids, list) or not ids:
            return {"error": "No candidate ids provided"}
        ids = [int(i) for i in ids if str(i).isdigit()]
        if not ids:
            return {"error": "No candidate ids provided"}
        conn = get_db()
        try:
            conn.execute("BEGIN")
            qmarks = ",".join("?" * len(ids))
            del_rows = conn.execute(
                "DELETE FROM payments WHERE sms_source_id IN (%s)" % qmarks, ids).rowcount
            ts = now_iso()
            conn.execute(
                "UPDATE sms_candidates SET status='approved', updated_at=? WHERE id IN (%s)"
                % qmarks, [ts] + ids)
            write_audit(conn, self._actor(), 'DELETE', 'payments', None,
                        after={"reverted": len(ids), "payments_removed": del_rows})
            conn.commit()
        except Exception as e:
            conn.rollback()
            LOGGER.exception("sms revert failed")
            return {"error": f"Revert failed: {e}"}
        finally:
            conn.close()
        return {"ok": True, "reverted": len(ids), "payments_removed": del_rows,
                **self._sms_review_list()}

    def _sms_add_alias(self, data):
        house_id = data.get('house_id')
        alias = str(data.get('alias', '')).strip()
        if not house_id or not alias:
            return {"error": "house_id and alias are required"}
        conn = get_db()
        try:
            h = conn.execute("SELECT id, name FROM houses WHERE id=? AND active=1", (house_id,)).fetchone()
            if not h:
                return {"error": "House not found"}
            ts = now_iso()
            try:
                conn.execute(
                    "INSERT INTO house_aliases (house_id, alias, created_at) VALUES (?, ?, ?)",
                    (house_id, alias, ts)
                )
            except Exception:
                return {"error": "That alias is already linked to this house"}
            write_audit(conn, self._actor(), 'CREATE', 'house_aliases', None,
                        after={"house_id": house_id, "alias": alias})
            conn.commit()
            return {"ok": True, "alias": alias, "house_name": h['name']}
        finally:
            conn.close()

    def _sms_delete_alias(self, data):
        house_id = data.get('house_id')
        alias = str(data.get('alias', '')).strip()
        if not house_id or not alias:
            return {"error": "house_id and alias are required"}
        conn = get_db()
        try:
            cur = conn.execute(
                "DELETE FROM house_aliases WHERE house_id=? AND alias=?",
                (house_id, alias))
            conn.commit()
            if cur.rowcount == 0:
                return {"error": "Alias not found"}
            write_audit(conn, self._actor(), 'DELETE', 'house_aliases', None,
                        after={"house_id": house_id, "alias": alias})
            conn.commit()
            return {"ok": True}
        finally:
            conn.close()

    def _sms_suggest(self, data):
        query = str(data.get('query', '')).strip()
        if not query:
            return {"suggestions": []}
        conn = get_db()
        try:
            houses = conn.execute(
                "SELECT id, name, house_number, fee, active FROM houses"
            ).fetchall()
            aliases = conn.execute("SELECT house_id, alias FROM house_aliases").fetchall()
        finally:
            conn.close()
        return {"suggestions": sms_import.suggest_houses(
            query, [dict(h) for h in houses], [dict(a) for a in aliases])}

    # ------------------------------------------------------------------ exports
    def _send_csv(self):
        conn = get_db()
        try:
            houses = conn.execute(
                "SELECT * FROM houses WHERE active=1 ORDER BY CAST(house_number AS INTEGER), house_number"
            ).fetchall()
            active_ids = {h['id'] for h in houses}
            payments = conn.execute(
                "SELECT * FROM payments WHERE house_id IN (%s)" %
                (",".join("?" * len(active_ids)) or "NULL"),
                tuple(active_ids)
            ).fetchall() if active_ids else []
        finally:
            conn.close()

        payments_dict = {(p['house_id'], p['month_key']): dict(p) for p in payments}
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['House Number', 'Name', 'Fee', 'Month', 'Paid Date', 'Amount', 'Status', 'Note'])
        for house in houses:
            months = sorted({p['month_key'] for p in payments if p['house_id'] == house['id']})
            if not months:
                months = [date.today().strftime('%Y-%m')]
            for month in months:
                payment = payments_dict.get((house['id'], month))
                paid_date = payment['paid_date'] if payment else ''
                amount = payment['amount'] if payment else ''
                status = 'Paid' if (payment and payment['paid_date']) else 'Unpaid'
                note = payment['note'] if payment else ''
                writer.writerow([house['house_number'], house['name'], house['fee'],
                                 month, paid_date, amount, status, note])
        body = output.getvalue().encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition",
                         f"attachment; filename=guardpay-export-{date.today().isoformat()}.csv")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)

    def _full_backup_dict(self):
        conn = get_db()
        try:
            def rows(q):
                return [dict(r) for r in conn.execute(q).fetchall()]
            data = {
                "schema_version": SCHEMA_VERSION,
                "exported_at": now_iso(),
                "settings": get_settings(),
                "houses": rows("SELECT * FROM houses"),
                "payments": rows("SELECT * FROM payments"),
                "guard_payments": rows("SELECT * FROM guard_payments"),
                "fee_change": rows("SELECT * FROM fee_change"),
                "reminders": rows("SELECT * FROM house_reminder"),
                "audit_log": rows(f"SELECT * FROM audit_log ORDER BY id DESC LIMIT {MAX_AUDIT_EXPORT}"),
            }
        finally:
            conn.close()
        return data

    def _send_json_backup(self):
        data = self._full_backup_dict()
        conn = get_db()
        try:
            write_audit(conn, self._actor(), 'EXPORT', 'all', None)
            conn.commit()
        finally:
            conn.close()
        body = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition",
                         f"attachment; filename=guardpay-backup-{date.today().isoformat()}.json")
        self.send_header("Content-Length", str(len(body)))
        self._security_headers()
        self.end_headers()
        self.wfile.write(body)
