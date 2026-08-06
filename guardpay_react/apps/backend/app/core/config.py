import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent  # guardpay_react/apps
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = os.environ.get("GUARDPAY_DB", str(DATA_DIR / "guardpay.db"))
DB_URL = f"sqlite+aiosqlite:///{DB_PATH}"
BACKUP_DIR = DATA_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)

SCHEMA_VERSION = 1
SESSION_MAX_AGE = 60 * 60 * 24 * 30  # 30 days
BACKUP_KEEP = 30

DEFAULT_SETTINGS = {
    "neighborhood_name": "Neighborhood Watch",
    "currency": "ETB",
    "due_day": "5",
    "guard_name": "Night Watch Guard",
    "guard_salary": "30000",
    "backup_before_changes": "0",
    "default_fee": "4000",
    "guard_account_suffix": "",
    "calendar_mode": "gregorian",
    "month_language": "english",
    "heatmap_shape": "square",
}

KNOWN_SETTINGS = set(DEFAULT_SETTINGS.keys())

GUARD_METHODS = {"transfer", "cash", "mobile"}

# scoring config (mirrors frontend defaults)
SCORING_WINDOW_MONTHS = 12
SCORING_STREAK_CAP = 8
SCORING_STREAK_PER_MONTH = 2
SCORING_TIERS = {"excellent": 90, "reliable": 70, "inconsistent": 40}
