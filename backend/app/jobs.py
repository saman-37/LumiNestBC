"""Background jobs. Owner: Backend (Person 2); stale nudge SMS owned by Communications (Person 3).

Runs inside the single gunicorn worker as Socket.IO background tasks. Because we run
exactly one worker (-w 1), each job runs once, not once per worker.
"""
import logging

from . import config
from .availability import change_beds
from .comms.voice import prewarm_fixed_phrases
from .db import transaction
from .sockets import emit_shelter_update, socketio

log = logging.getLogger(__name__)
_started = False


def expire_holds() -> int:
    """Expire holds past expires_at, give their beds back, log and broadcast. Returns count."""
    updated_shelters = {}
    with transaction() as conn:
        expired = conn.execute(
            "UPDATE holds SET status = 'expired'"
            " WHERE status = 'active' AND expires_at <= now() RETURNING id, shelter_id"
        ).fetchall()
        for hold in expired:
            shelter, _ = change_beds(conn, hold["shelter_id"], delta=1, source="expiry", hold_id=hold["id"])
            updated_shelters[shelter["id"]] = shelter
    for shelter in updated_shelters.values():
        emit_shelter_update(shelter)
    if expired:
        log.info("expired %d hold(s)", len(expired))
    return len(expired)


def nudge_stale_shelters() -> None:
    """Text shelters whose count hasn't been confirmed in STALE_NUDGE_AFTER_MINUTES.

    Disabled unless SMS_NUDGE_ENABLED=true.
    TODO(Communications): send via Twilio, e.g. "LuminestBC: how many beds are open right now?
    Reply with a number." Replies arrive at POST /twilio/sms and go through
    comms.gemini.parse_staff_text(). Don't nudge the same shelter more than once per window.
    """
    with transaction() as conn:
        stale = conn.execute(
            "SELECT id, staff_phone FROM shelters"
            " WHERE staff_phone IS NOT NULL AND last_updated_at < now() - %s::int * interval '1 minute'",
            (config.STALE_NUDGE_AFTER_MINUTES,),
        ).fetchall()
    log.info("stale nudge (stub): %d shelter(s) would be texted", len(stale))


def _prewarm_voice() -> None:
    """Generate the fixed voice-line phrases once at startup; calls fall back to <Say> if this fails."""
    try:
        prewarm_fixed_phrases()
    except Exception:  # never block startup on text-to-speech
        log.exception("voice prewarm failed; calls will use <Say> until audio is generated")


def _every(seconds: int, fn) -> None:
    while True:
        try:
            fn()
        except Exception:  # keep the loop alive; one bad run shouldn't stop expiries
            log.exception("background job %s failed", fn.__name__)
        socketio.sleep(seconds)


def start_jobs() -> None:
    global _started
    if _started:
        return
    _started = True
    socketio.start_background_task(_every, config.EXPIRE_HOLDS_INTERVAL_SECONDS, expire_holds)
    socketio.start_background_task(_prewarm_voice)
    if config.SMS_NUDGE_ENABLED:
        socketio.start_background_task(_every, config.STALE_NUDGE_INTERVAL_SECONDS, nudge_stale_shelters)
