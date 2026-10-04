"""Staff-portal keys, the admin key and a small rate limiter. Owner: Backend (Person 2).

No accounts or passwords: each shelter has one private staff key (sent in the X-Staff-Key
header). Only a SHA-256 hash is stored; comparisons use hmac.compare_digest.
"""
import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from . import config

STAFF_KEY_BYTES = 24  # token_urlsafe(24) -> 32 URL-safe characters


def new_staff_key() -> str:
    return secrets.token_urlsafe(STAFF_KEY_BYTES)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def staff_key_valid(conn, shelter_id: str, key: str) -> bool:
    if not key:
        return False
    row = conn.execute("SELECT key_hash FROM staff_keys WHERE shelter_id = %s", (shelter_id,)).fetchone()
    return row is not None and hmac.compare_digest(row["key_hash"], hash_key(key))


def set_staff_key(conn, shelter_id: str) -> str:
    """Create or replace a shelter's staff key. Returns the plain key (shown once, never stored)."""
    key = new_staff_key()
    conn.execute(
        "INSERT INTO staff_keys (shelter_id, key_hash) VALUES (%s, %s)"
        " ON CONFLICT (shelter_id) DO UPDATE SET key_hash = EXCLUDED.key_hash,"
        " created_at = now(), last_used_at = NULL",
        (shelter_id, hash_key(key)),
    )
    return key


def admin_key_valid(key: str) -> bool:
    """The admin key only works while dev tools are enabled and ADMIN_KEY is set."""
    if not (config.DEV_TOOLS_ENABLED and config.ADMIN_KEY and key):
        return False
    return hmac.compare_digest(config.ADMIN_KEY.encode(), key.encode())


class RateLimiter:
    """Sliding one-minute window per bucket (a shelter id, or "admin")."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, bucket: str, limit: int) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[bucket]
            while hits and now - hits[0] > 60:
                hits.popleft()
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()
