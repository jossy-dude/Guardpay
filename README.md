# GuardPay — Neighborhood Security Fee Tracker

A self-hosted local server for tracking monthly security guard payments.  
Standard library only. Zero dependencies. Single-command startup.

---

## Quick Start

```bash
cd guardpay
python3 server.py              # starts on port 8420, opens browser
python3 server.py --local      # binds 127.0.0.1 only (no LAN access)
python3 server.py 9000         # custom port
```

Or install globally:
```bash
bash setup.sh     # installs ~/.local/bin/guardpay
guardpay           # run from anywhere
```

**Requirements:** Python 3.7+ (uses `secrets`, `datetime.timezone`). No pip packages needed.

---

## Project Structure (Restructured 2026-07-23)

```
guardpay/
├── server.py                  # Entry point — CLI args, DB init, HTTP server bootstrap
├── guardpay.sh                # Bash launcher
├── setup.sh                   # Installs ~/.local/bin/guardpay
├── requirements.txt           # Documents Python version (stdlib-only)
├── README.md                  # This file
├── src/
│   ├── __init__.py
│   ├── config.py              # All constants: paths, limits, settings whitelist
│   ├── database.py            # SQLite schema, connection pool, init_db(), LOCK
│   ├── auth.py                # PIN hashing (PBKDF2), session tokens (HMAC-SHA256)
│   ├── backup.py              # Online backup API, rotation, daily snapshots
│   ├── audit.py               # Audit trail writer (before/after JSON)
│   ├── settings.py            # Settings CRUD + validation
│   ├── handlers.py            # HTTP Handler class — all route logic
│   ├── ratelimit.py           # Per-IP sliding-window rate limiter
│   └── utils.py               # Parse helpers, timestamps, IP detection
├── static/
│   ├── index.html             # SPA layout
│   ├── app.js                 # Frontend logic (~2160 lines)
│   ├── i18n.js                # English/Amharic translations (~940 lines)
│   ├── style.css              # Design system (oklch palette, dark/light themes)
│   ├── jspdf.umd.min.js       # Vendored — PDF generation
│   └── html2canvas-pro.min.js # Vendored — DOM → canvas rasterization
└── TEMPLATE_AUTHORING_GUIDE.md
```

### Module Responsibilities

| Module | Lines | Purpose |
|--------|-------|---------|
| `config.py` | 60 | Central constants. One place to change paths, limits, feature flags. |
| `database.py` | 130 | WAL schema, `get_db()` connection factory, `init_db()`, global `LOCK`. |
| `auth.py` | 80 | PBKDF2 PIN hashing, HMAC-SHA256 session tokens, verification. |
| `backup.py` | 65 | SQLite online backup API, 30-snapshot rotation, daily auto-snapshots. |
| `audit.py` | 20 | Writes before/after JSON to `audit_log` table. |
| `settings.py` | 60 | Whitelist-validated settings CRUD. |
| `handlers.py` | 950 | `Handler(BaseHTTPRequestHandler)` — all GET/POST/OPTIONS routes. |
| `ratelimit.py` | 30 | Per-IP sliding window (300 req/min, loopback exempt). |
| `utils.py` | 60 | `parse_int`, `parse_month`, `parse_date`, `get_local_ip`. |
| `server.py` | 75 | Entry point. CLI parsing, DB init, `ThreadingHTTPServer` bootstrap. |

---

## Features

- **SQLite WAL** — concurrent reads, atomic writes, crash-safe
- **PIN authentication** — PBKDF2 with 200k iterations, constant-time comparison
- **Session tokens** — HMAC-SHA256 signed, 30-day expiry, HttpOnly + SameSite=Strict
- **Rate limiting** — 300 req/min per IP, loopback exempt
- **Audit trail** — every mutation logged with actor, before/after JSON
- **Automatic backups** — daily snapshots on startup, 30-day rotation
- **5 PDF templates** — monthly, guard payment, scorecard, annual, custom
- **English/Amharic** — full bilingual UI (400+ translation keys)
- **5 themes** — light, dark, sepia, ocean, forest
- **CSV/JSON export** — server-side CSV, client-side PDF, full JSON backup
- **Import/restore** — JSON import with validation and pre-import backup
- **Keyboard fast-entry** — type house number + Enter to toggle payment

---

## What Was Done (2026-07-23)

### 1. Comprehensive Codebase Audit

A full audit was performed across 5 dimensions (security, data storage, export, frontend/a11y, code quality) plus web research on known issues. The findings are at the end of this file.

### 2. watch-ledger Removed

The `watch-ledger/` sub-project was a simpler prototype that had:
- Zero authentication (all endpoints open)
- CORS `Access-Control-Allow-Origin: *` (any website on LAN could read/overwrite data)
- No backups, no audit trail, no rate limiting
- Full-state replacement model (last write wins, no conflict detection)

**Verdict:** Strict subset of guardpay with critical security liabilities. Removed entirely.

### 3. server.py Monolith Split Into Modules

The original 1,459-line `server.py` was split into 10 focused modules under `src/`.

**Before:** One file containing schema, auth, backup, audit, settings, rate limiting, MIME types, the HTTP handler, and server bootstrap.

**After:** Each concern is isolated in its own module with clear responsibilities. The `src/` package uses relative imports internally; `server.py` uses absolute `from src.*` imports.

### 4. BACKEND_AUDIT_REPORT.md Removed

The standalone audit report was removed — all findings are now documented at the end of this README.

---

## Audit Report (2026-07-23)

### Security Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| S1 | watch-ledger had zero authentication | Critical | **Fixed** — watch-ledger removed |
| S2 | watch-ledger had CORS `*` | Critical | **Fixed** — watch-ledger removed |
| S3 | No brute-force lockout on PIN login | High | Open — recommend adding progressive delay |
| S4 | Session not invalidated on PIN change | High | Open — recommend regenerating `session_secret` |
| S5 | No CSRF tokens (mitigated by SameSite=Strict) | Medium | Accepted for LAN use |
| S6 | No Content-Security-Policy header | Medium | Open |
| S7 | Session cookie missing `Secure` flag (plain HTTP) | Medium | Open — needs TLS first |
| S8 | Plain HTTP only — PIN in cleartext on LAN | Medium | Open — needs TLS |

**What's done well:** PBKDF2 200k iterations, constant-time comparison, all SQL parameterized (zero injection), `escapeHtml()` on all DOM output, 5MB body limit, security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy).

### Data Storage Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| D1 | WAL mode enabled | Good | — |
| D2 | Foreign keys, UNIQUE, CHECK constraints | Good | — |
| D3 | Full audit trail with before/after JSON | Good | — |
| D4 | No schema migration mechanism | High | Open |
| D5 | No connection pooling (new conn per call) | Medium | Open |
| D6 | Global LOCK serializes all reads AND writes | Medium | Open |
| D7 | `backup_before_changes` defaults to off | Medium | Open |
| D8 | Crash-mid-write safe (WAL atomicity) | Good | — |

### Export Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| E1 | PDF is raster screenshot (non-selectable text) | Info | By design |
| E2 | No large-dataset guard for PDF on mobile | High | Open |
| E3 | No UTF-8 BOM in CSV — Excel mangles Amharic | Medium | Open |
| E4 | No backup integrity verification | High | Open |
| E5 | Restore from `.db` backup not possible via UI | High | Open |

### Frontend / Accessibility Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| A1 | No focus trap in modals/drawers | High | Open |
| A2 | SVG charts lack per-bar descriptions | Medium | Open |
| A3 | Score dots, heatmap cells invisible to assistive tech | Medium | Open |
| A4 | Toast notifications not announced (no `aria-live`) | Low | Open |
| A5 | `prefers-reduced-motion` respected | Good | — |
| A6 | Skip link exists, `:focus-visible` styles present | Good | — |

### i18n Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| I1 | Near-100% Amharic coverage (400+ keys) | Good | — |
| I2 | Some Amharic translations have corruption artifacts | High | Open |
| I3 | `toast_added_n` key untranslated in Amharic | High | Open |

### Code Quality Findings

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| C1 | 1,459-line monolith server.py | High | **Fixed** — split into 10 modules |
| C2 | Zero tests in entire project | Critical | Open |
| C3 | No logging (log_message suppressed) | Critical | Open |
| C4 | ~40% code overlap with watch-ledger | Medium | **Fixed** — watch-ledger removed |
| C5 | Silent `except Exception: pass` in backup code | Medium | Open |

### Known Issues from Web Research

| Topic | Finding |
|-------|---------|
| Python http.server | CVE-2021-28861 (open redirect, fixed 3.11+). CRLF injection in `send_header()` — unfixed. Acceptable for LAN with handler-level security. |
| SQLite WAL on LAN | WAL does NOT work over network filesystems (NFS/SMB). Works correctly when server and DB are on the same machine (which is how guardpay runs). |
| PBKDF2 brute-force | NIST SP 800-63B-4 (2025) recommends progressive delay (not hard lockout). Reset counter on success. |
| html2canvas + Amharic | Ge'ez script is mostly precomposed (single code points), so html2canvas handles it better than many complex scripts. Switching to SnapDOM/modern-screenshot would improve rendering. |

---

## Architecture Notes

### Why `http.server`?

The stdlib `ThreadingHTTPServer` was chosen for zero dependencies. For a trusted LAN with <50 concurrent users, it's adequate. The real security is at the handler level (input validation, parameterized SQL, auth), not the HTTP server.

### Why SQLite WAL?

WAL mode allows concurrent readers while a write is in progress — critical for a LAN server where multiple browser tabs/devices read simultaneously. Without WAL, every write would block all readers.

### The Global LOCK

A single `threading.Lock()` serializes all writes AND reads through `/api/state`. This prevents SQLite contention but creates a bottleneck at ~30-50 concurrent users. For a 15-30 household neighborhood, this is fine. A reader-writer lock pattern could improve this for larger deployments.

### Backup Strategy

- **Daily auto-snapshot** on server startup (one per calendar day)
- **Pre-change snapshot** before destructive operations (delete, import) — optional, off by default
- **30-day rotation** — oldest backups deleted automatically
- **SQLite online backup API** — consistent hot copies without locking
- **Limitation:** Backups are local-only. Disk failure loses both live DB and backups.

---

## Changelog

### 2026-07-23 — Major Restructure

- **Removed** `watch-ledger/` entirely (critical security liabilities)
- **Split** `server.py` (1,459 lines) into 10 modules under `src/`
- **Added** `README.md` with full audit report
- **Added** `requirements.txt`
- **Removed** `BACKEND_AUDIT_REPORT.md` (findings consolidated into README)
- **Verified** server starts and API responds correctly after restructure
