"""
Central configuration constants for GuardPay.
All paths, limits, and feature flags live here.
"""
import os

# Path layout — src/ lives inside guardpay/, so parent is the project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DB_FILE = os.path.join(BASE_DIR, "guardpay.db")
BACKUP_DIR = os.path.join(BASE_DIR, "backups")

# Schema & limits
# Bump this + add an entry to MIGRATIONS in database.py whenever the schema changes.
# init_db() runs the base CREATE-TABLE-IF-NOT-EXISTS script (fine for fresh installs),
# then run_migrations() applies any ALTER/CREATE steps needed to bring an *existing*
# database up to this version. Never edit an already-shipped migration — add a new one.
SCHEMA_VERSION = 4
MAX_BODY_BYTES = 5 * 1024 * 1024          # 5 MB request cap

# Logging (rotating file — server console output is intentionally quiet)
LOG_FILE = os.path.join(BASE_DIR, "guardpay.log")
LOG_MAX_BYTES = 2 * 1024 * 1024
LOG_BACKUP_COUNT = 2

# Rate limiting
RATE_LIMIT_MAX = 300                        # requests per window per non-loopback IP
RATE_LIMIT_WINDOW = 60                       # seconds

# Auth / sessions
SESSION_MAX_AGE = 60 * 60 * 24 * 30         # 30 days

# Backups
BACKUP_KEEP = 30                             # rotating snapshots to keep

# Default fee (monthly collection) for new houses
DEFAULT_HOUSE_FEE = '4000'

# SMS import — the commercial bank sender used by the parser (CBE only).
DEFAULT_BANK = 'CBE'
DEFAULT_GUARD_ACCOUNT = '3325'   # last digits of the guard's CBE account to watch

# Scoring system thresholds
SCORE_ON_TIME = 100
SCORE_LATE_MILD = 55
SCORE_LATE_MODERATE = 30
SCORE_LATE_SEVERE = 10
SCORE_STREAK_BONUS = 15
SCORE_DOT_DIVISOR = 20
SCORE_MAX = 100
TIER_EXCELLENT_MIN = 400
TIER_RELIABLE_MIN = 200
TIER_INCONSISTENT_MIN = 100

# Settings validation bounds
MAX_DUE_DAY = 28
MAX_CURRENCY_LENGTH = 8
MAX_SETTING_VALUE_LENGTH = 120

# Audit / export limits
DEFAULT_AUDIT_LIMIT = 100
MAX_AUDIT_LIMIT = 1000
MAX_AUDIT_EXPORT = 2000

# Database
DB_TIMEOUT = 10

# PDF rendering
PDF_PREVIEW_WIDTH = 540
PDF_CANVAS_SCALE = 3
PDF_JPEG_QUALITY = 0.95

# UI defaults
TOAST_DURATION_MS = 2400
RIPPLE_REMOVE_MS = 640
COUNTUP_DURATION_MS = 950
MAX_ANIMATION_ROWS = 12
ANIMATION_DELAY_MS = 22
MAX_HISTORY_MONTHS = 600
PROGRESS_SQUARES = 50
LEADERBOARD_TOP_N = 10
PIN_STRENGTH_WEAK = 4
PIN_STRENGTH_MEDIUM = 6
PIN_STRENGTH_STRONG = 8

# Google Drive timeouts
GDRIVE_TOKEN_TIMEOUT = 15
GDRIVE_API_TIMEOUT = 20
GDRIVE_UPLOAD_TIMEOUT = 60

# Backup
BACKUP_REASON_MAX_LEN = 24

# Diagnostics
MIN_DISK_FREE_MB = 50

# Settings whitelist
KNOWN_SETTINGS = {
    'neighborhood_name', 'currency', 'due_day', 'guard_name',
    'guard_salary', 'backup_before_changes', 'default_fee',
    'guard_account_suffix', 'parse_start_date',
}

# Guard payment methods
GUARD_METHODS = {'transfer', 'cash', 'mobile'}

# Default settings seeded on first run
DEFAULT_SETTINGS = {
    'neighborhood_name': 'Neighborhood Watch',
    'currency': 'ETB',
    'due_day': '5',
    'guard_name': 'Night Watch Guard',
    'guard_salary': '30000',
    'backup_before_changes': '0',
    'default_fee': DEFAULT_HOUSE_FEE,
    'guard_account_suffix': DEFAULT_GUARD_ACCOUNT,
    'parse_start_date': '',
}

# MIME type map for static file serving
MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
}
