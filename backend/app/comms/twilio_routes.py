"""Twilio webhooks for the voice line and staff SMS. Owner: Communications (Person 3). Tier 2.

Call flow:
  POST /twilio/voice         greeting + <Gather input="speech">
  POST /twilio/voice/heard   keep SpeechResult in memory by CallSid, reply filler + <Redirect> at once
  POST /twilio/voice/answer  gemini.extract_voice_request() -> matcher.rank_shelters() -> speak top 2
  GET  /audio/<id>.mp3       ElevenLabs audio cached by voice.text_to_speech()
  POST /twilio/sms           staff text -> gemini.parse_staff_text() -> bed change (source='sms')

Gemini runs in /answer, not /heard, so the caller hears the filler line while it works.

Privacy: never store caller numbers, transcripts, recordings or SMS text. Transcripts live
only in memory until /answer runs (or CALL_STATE_TTL_SECONDS passes), and are never logged.
"""
import logging
import re
import threading
import time
from xml.sax.saxutils import escape

from flask import Blueprint, Response, abort, request
from twilio.request_validator import RequestValidator

from .. import config
from ..availability import change_beds, public_shelter
from ..db import transaction
from ..sockets import emit_shelter_update
from .gemini import extract_voice_request, parse_staff_text
from .matcher import find_area, rank_shelters
from .voice import beds_word, cache_audio, describe_match, get_cached_audio, say, text_to_speech

log = logging.getLogger(__name__)

bp = Blueprint("comms", __name__)

LANGUAGE = "en-CA"
CALL_STATE_TTL_SECONDS = 10 * 60

# CallSid -> (transcript, stored_at). In memory only; one gunicorn worker serves every call.
_calls: dict[str, tuple[str, float]] = {}
_calls_lock = threading.Lock()


def twiml(*verbs: str) -> Response:
    body = '<?xml version="1.0" encoding="UTF-8"?><Response>' + "".join(verbs) + "</Response>"
    return Response(body, mimetype="text/xml")


def say_verb(text: str) -> str:
    return f'<Say language="{LANGUAGE}">{escape(text)}</Say>'


def play_or_say(text: str) -> str:
    """Return Twilio <Play> using ElevenLabs audio if available, else fallback to <Say>."""
    audio_bytes = text_to_speech(text)
    if audio_bytes:
        audio_id = cache_audio(audio_bytes)
        audio_url = f"{config.BACKEND_PUBLIC_URL.rstrip('/')}/audio/{audio_id}.mp3"
        return f"<Play>{escape(audio_url)}</Play>"
    return say_verb(text)


def sms_reply(text: str) -> Response:
    return twiml(f"<Message>{escape(text)}</Message>")


# --- Webhook security -------------------------------------------------------------

@bp.before_request
def check_twilio_signature():
    """Reject /twilio/* requests that weren't signed by Twilio with our auth token."""
    if not request.path.startswith("/twilio/"):
        return
    token = config.TWILIO_AUTH_TOKEN
    if not token:
        log.warning("TWILIO_AUTH_TOKEN is not set; skipping Twilio signature check (local dev only)")
        return
    # Rebuild the URL Twilio called from BACKEND_PUBLIC_URL: behind Render's proxy
    # request.url says http://, which would never match the signature.
    url = config.BACKEND_PUBLIC_URL.rstrip("/") + request.path
    if request.query_string:
        url += "?" + request.query_string.decode()
    signature = request.headers.get("X-Twilio-Signature", "")
    if not RequestValidator(token).validate(url, request.form.to_dict(), signature):
        abort(403)


# --- Voice line -------------------------------------------------------------------

def _remember(call_sid: str, transcript: str) -> None:
    now = time.monotonic()
    with _calls_lock:
        for sid in [sid for sid, (_, at) in _calls.items() if now - at > CALL_STATE_TTL_SECONDS]:
            del _calls[sid]
        _calls[call_sid] = (transcript, now)


def _take(call_sid: str) -> str | None:
    with _calls_lock:
        entry = _calls.pop(call_sid, None)
    if entry is None or time.monotonic() - entry[1] > CALL_STATE_TTL_SECONDS:
        return None
    return entry[0]


def load_public_shelters() -> list[dict]:
    with transaction() as conn:
        rows = conn.execute("SELECT * FROM shelters ORDER BY name").fetchall()
    return [public_shelter(r) for r in rows]


def answer_lines(transcript: str) -> list[str]:
    """Turn what the caller said into the sentences to speak (best matches first)."""
    req = extract_voice_request(transcript)
    area = find_area(req.get("area_text"))
    origin = (area[1], area[2]) if area else None
    matches = rank_shelters(req, load_public_shelters(), origin=origin)
    lines = [line for m in matches if (line := describe_match(m, area[0] if area else None))]
    return lines or [say("no_match")]


@bp.post("/twilio/voice")
def voice_start():
    """Answer the call: greet, then listen for the caller's needs."""
    return twiml(
        play_or_say(say("greeting")),
        f'<Gather input="speech" action="/twilio/voice/heard" method="POST" '
        f'speechTimeout="auto" language="{LANGUAGE}">{play_or_say(say("prompt"))}</Gather>',
        play_or_say(say("no_speech")),
    )


@bp.post("/twilio/voice/heard")
def voice_heard():
    """Keep the transcript for /answer and reply straight away so the caller hears the filler."""
    transcript = request.form.get("SpeechResult", "").strip()
    call_sid = request.form.get("CallSid", "")
    if not transcript or not call_sid:
        return twiml(play_or_say(say("no_speech")), "<Hangup/>")
    _remember(call_sid, transcript)
    return twiml(play_or_say(say("filler")), '<Redirect method="POST">/twilio/voice/answer</Redirect>')


@bp.post("/twilio/voice/answer")
def voice_answer():
    """Extract needs, rank real beds and speak the top matches. Never fails the call."""
    transcript = _take(request.form.get("CallSid", ""))
    if transcript is None:
        return twiml(play_or_say(say("no_match")), "<Hangup/>")
    try:
        lines = answer_lines(transcript)
    except Exception as exc:  # noqa: BLE001  any failure -> point the caller to BC 211
        log.warning("voice answer failed: %s", type(exc).__name__)  # never log the transcript
        lines = [say("no_match")]
    return twiml(*(play_or_say(line) for line in lines), "<Hangup/>")


@bp.get("/audio/<audio_id>.mp3")
def audio(audio_id):
    """Return cached ElevenLabs MP3 for audio_id."""
    data = get_cached_audio(audio_id)
    if not data:
        return {"error": "audio_not_found"}, 404
    return Response(data, mimetype="audio/mpeg")


# --- Staff SMS --------------------------------------------------------------------

def normalize_phone(phone: str | None) -> str:
    """"+1 (604) 555-0101", "604-555-0101" and "+16045550101" all become "6045550101"."""
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def _int_or_none(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def bed_change(parsed: dict) -> dict | None:
    """change_beds() kwargs for a parsed staff text, or None if no count was understood."""
    open_beds = _int_or_none(parsed.get("open_beds"))
    change = _int_or_none(parsed.get("change"))
    if open_beds is not None and open_beds >= 0:
        return {"set_to": open_beds}
    if change:
        return {"delta": change}
    if parsed.get("is_full") is True:
        return {"set_to": 0}
    return None


def find_shelter_by_staff_phone(phone: str) -> list[dict]:
    """Non-DV shelters whose staff_phone matches. DV shelters can't update by SMS for now."""
    wanted = normalize_phone(phone)
    if len(wanted) < 10:
        return []
    with transaction() as conn:
        rows = conn.execute(
            "SELECT id, name, staff_phone FROM shelters WHERE NOT is_dv AND staff_phone IS NOT NULL"
        ).fetchall()
    return [r for r in rows if normalize_phone(r["staff_phone"]) == wanted]


@bp.post("/twilio/sms")
def sms():
    """Staff text like "2 beds open" -> change_beds(source='sms', staff_update=True)."""
    shelters = find_shelter_by_staff_phone(request.form.get("From", ""))
    if len(shelters) != 1:
        return sms_reply(
            "This number isn't set up to update a shelter on LuminestBC. "
            "Please contact the LuminestBC team."
        )
    change = bed_change(parse_staff_text(request.form.get("Body", "")))
    if change is None:
        return sms_reply('Sorry, I couldn\'t read a bed count. Try "3 beds open", "1 more bed" or "full".')
    with transaction() as conn:
        updated, _ = change_beds(conn, shelters[0]["id"], source="sms", staff_update=True, **change)
    emit_shelter_update(updated)
    n = updated["open_beds"]
    return sms_reply(f"Thanks! {updated['name']} now shows {n} open {beds_word(n)}.")
