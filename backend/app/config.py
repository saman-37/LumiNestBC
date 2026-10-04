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
# Apply sql/schema.sql (idempotent) when the server starts, so a fresh database needs no manual step.
AUTO_MIGRATE = _bool("AUTO_MIGRATE", True)

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5").strip()  # low latency for phone calls

# Base URL written onto NFC tags and staff-portal links (generate_tag_links.py, tag rotation).
TAG_BASE_URL = os.getenv("TAG_BASE_URL", "https://luminestbc.tech").rstrip("/")

# Admin / test hub (/admin, /api/admin/*, /api/dev/*). Needs ADMIN_KEY as well; without it every
# admin endpoint answers 403, so production can keep this on for the demo behind a long key.
DEV_TOOLS_ENABLED = _bool("DEV_TOOLS_ENABLED", True)
ADMIN_KEY = os.getenv("ADMIN_KEY", "")

SMS_NUDGE_ENABLED = _bool("SMS_NUDGE_ENABLED", False)

# --- Tag taps --------------------------------------------------------------------
TAG_COOLDOWN_SECONDS = 5        # same tag tapped again within this window is ignored
UNDO_WINDOW_SECONDS = 10        # a tap can be undone for this long

# --- Staff portal ----------------------------------------------------------------
STAFF_RATE_LIMIT_PER_MINUTE = 60   # requests per shelter (and for admin) per minute
STAFF_REVERT_WINDOW_MINUTES = 60   # tap/text/staff changes can be reverted for this long
STAFF_EVENTS_LIMIT = 30

# --- Voice audio cache -------------------------------------------------------------
AUDIO_CACHE_TTL_SECONDS = 30 * 60  # dynamic answers; fixed phrases are kept forever
# Generated MP3s are also kept on disk (keyed by voice + model + text), so a restart doesn't pay
# ElevenLabs again for the same sentences. Empty = memory only. Git-ignored.
AUDIO_DISK_CACHE_DIR = os.getenv("AUDIO_DISK_CACHE_DIR", str(REPO_ROOT / "backend" / ".audio_cache"))
# After ElevenLabs refuses (quota used up, bad key, missing permission), stop asking for this long
# and use the fallback voice instead of failing on every line.
TTS_PAUSE_AFTER_REFUSAL_SECONDS = 10 * 60

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
