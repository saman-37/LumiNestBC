"""All configuration in one place. Owner: Backend (Person 2).

Secrets and URLs come from environment variables (see .env.example at the repo root).
Every tunable number lives here so nobody hunts for magic constants in route code.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")
load_dotenv()  # also allow backend/.env or the current directory


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# --- Environment ---------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://luminest:luminest@localhost:5432/luminestbc")
FRONTEND_ORIGINS = [
    o.strip() for o in os.getenv("FRONTEND_ORIGIN", "http://localhost:5173").split(",") if o.strip()
]
BACKEND_PUBLIC_URL = os.getenv("BACKEND_PUBLIC_URL", "http://localhost:8000")
DB_POOL_MAX_SIZE = int(os.getenv("DB_POOL_MAX_SIZE", "20"))

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "")

SMS_NUDGE_ENABLED = _bool("SMS_NUDGE_ENABLED", False)

# --- Tag taps --------------------------------------------------------------------
TAG_COOLDOWN_SECONDS = 5        # same tag tapped again within this window is ignored
UNDO_WINDOW_SECONDS = 10        # a tap can be undone for this long

# --- Holds -----------------------------------------------------------------------
HOLD_MINUTES = 60
WORKER_FIELD_MAX_LEN = 80

# --- Freshness badges (minutes since staff last confirmed the count) ------------
FRESH_GREEN_MAX_MINUTES = 60    # under this: green
FRESH_AMBER_MAX_MINUTES = 180   # up to this: amber; over: red

# --- Background jobs -------------------------------------------------------------
EXPIRE_HOLDS_INTERVAL_SECONDS = 60
STALE_NUDGE_INTERVAL_SECONDS = 15 * 60
STALE_NUDGE_AFTER_MINUTES = 180

# --- Voice-line matcher (comms/matcher.py) ---------------------------------------
MATCH_TOP_N = 2
MATCH_FRESHNESS_DIVISOR = 30    # score += min(minutes_since_update / 30, cap)
MATCH_FRESHNESS_CAP = 10
MATCH_UNKNOWN_DISTANCE_KM = 5   # used for DV shelters and shelters without coordinates
