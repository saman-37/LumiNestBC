import json
import logging
import threading
import time
import urllib.request
import uuid

from .. import config
from .http import ssl_context

logger = logging.getLogger(__name__)

# Audio cache, in memory only (one gunicorn worker serves every call).
#   _AUDIO_CACHE: audio_id -> MP3 bytes (served at GET /audio/<id>.mp3)
#   _BY_TEXT:     exact text -> (audio_id, created_at, fixed)
# The same phrase is generated once and reused. Fixed phrases stay forever; dynamic answers
# are evicted after AUDIO_CACHE_TTL_SECONDS.
_AUDIO_CACHE: dict[str, bytes] = {}
_BY_TEXT: dict[str, tuple[str, float, bool]] = {}
_cache_lock = threading.Lock()
_text_locks: dict[str, threading.Lock] = {}

# Said on every call, so they're generated at startup (prewarm_fixed_phrases).
FIXED_PHRASES = ("greeting", "prompt", "filler", "no_speech", "no_match")

TEMPLATES = {
    "greeting": (
        "Hi, this is Luminest B C. I can help find a shelter bed tonight in Metro Vancouver. "
        "I won't ask for your name."
    ),
    "prompt": (
        "Tell me who needs a bed, like a woman, a man, a family, or someone with a pet, "
        "and roughly where you are."
    ),
    "filler": "Thanks. One moment while I check which shelters have beds right now.",
    "match": (
        "{name} has {open_beds} open {beds_word}, {distance} from {area}. "
        "The address is {address}. Their count was updated {updated}."
    ),
    "match_no_area": (
        "{name} has {open_beds} open {beds_word}. "
        "The address is {address}. Their count was updated {updated}."
    ),
    "dv": (
        "There is a confidential shelter for people leaving violence with a bed available. "
        "Please call {phone}."
    ),
    "no_match": (
        "I couldn't find an open bed that fits right now. Please call B C 2 1 1 by dialing 2 1 1, "
        "or call back in a little while."
    ),
    "not_ready": "The bed finder is still being set up. Please call B C 2 1 1 by dialing 2 1 1.",
    "no_speech": "Sorry, I didn't catch that. Please call back and try again.",
}


def say(template: str, **values) -> str:
    """Fill a template, e.g. say("dv", phone="604 555 0199")."""
    return TEMPLATES[template].format(**values)


def beds_word(count: int) -> str:
    return "bed" if count == 1 else "beds"


def spoken_distance(km: float) -> str:
    if km < 1:
        return "less than a kilometre"
    rounded = round(km)
    return f"about {rounded} kilometre" + ("" if rounded == 1 else "s")


def spoken_age(minutes: int) -> str:
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes} minute{'' if minutes == 1 else 's'} ago"
    hours = round(minutes / 60)
    return f"about {hours} hour{'' if hours == 1 else 's'} ago"


def spoken_phone(phone: str) -> str:
    """Read a number digit by digit in groups: "604-555-0199" -> "6 0 4, 5 5 5, 0 1 9 9"."""
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    groups = [digits[:3], digits[3:6], digits[6:]] if len(digits) == 10 else [digits]
    return ", ".join(" ".join(group) for group in groups if group)


def describe_match(match: dict, area_name: str | None) -> str | None:
    """Spoken line for one rank_shelters() result, or None if it can't be said safely.

    DV shelters only ever get the "dv" template (a phone number, never a location).
    """
    shelter = match["shelter"]
    if shelter["is_dv"]:
        phone = shelter.get("dv_phone")
        return say("dv", phone=spoken_phone(phone)) if phone else None
    values = {
        "name": shelter["name"],
        "open_beds": shelter["open_beds"],
        "beds_word": beds_word(shelter["open_beds"]),
        "address": shelter.get("address") or "not listed",
        "updated": spoken_age(shelter["minutes_since_update"]),
    }
    if area_name and match.get("distance_km") is not None:
        return say("match", distance=spoken_distance(match["distance_km"]), area=area_name, **values)
    return say("match_no_area", **values)


def cache_audio(audio_bytes: bytes) -> str:
    """Store generated MP3 bytes in memory and return a unique audio ID."""
    audio_id = uuid.uuid4().hex
    with _cache_lock:
        _AUDIO_CACHE[audio_id] = audio_bytes
    return audio_id


def get_cached_audio(audio_id: str) -> bytes | None:
    """Retrieve cached MP3 bytes by audio ID."""
    return _AUDIO_CACHE.get(audio_id)


def _evict_expired_locked(now: float) -> None:
    for text, (audio_id, created, fixed) in list(_BY_TEXT.items()):
        if not fixed and now - created > config.AUDIO_CACHE_TTL_SECONDS:
            del _BY_TEXT[text]
            _AUDIO_CACHE.pop(audio_id, None)


def audio_id_for(text: str, fixed: bool = False) -> str | None:
    """Audio id for this exact text, generating it with ElevenLabs only the first time.

    Returns None if text-to-speech isn't available (callers fall back to Twilio <Say>).
    Concurrent requests for the same text wait for one generation instead of each calling.
    """
    with _cache_lock:
        hit = _BY_TEXT.get(text)
        if hit and hit[0] in _AUDIO_CACHE:
            if fixed and not hit[2]:
                _BY_TEXT[text] = (hit[0], hit[1], True)
            return hit[0]
        text_lock = _text_locks.setdefault(text, threading.Lock())
    with text_lock:
        with _cache_lock:
            hit = _BY_TEXT.get(text)
            if hit and hit[0] in _AUDIO_CACHE:
                return hit[0]
        audio = text_to_speech(text)
        with _cache_lock:
            _text_locks.pop(text, None)
            if audio is None:
                return None
            now = time.monotonic()
            _evict_expired_locked(now)
            audio_id = uuid.uuid4().hex
            _AUDIO_CACHE[audio_id] = audio
            _BY_TEXT[text] = (audio_id, now, fixed)
            return audio_id


def prewarm_fixed_phrases() -> int:
    """Generate the phrases every call uses, so callers never wait for them. Returns how many."""
    if not config.ELEVENLABS_API_KEY:
        return 0
    ready = sum(audio_id_for(say(name), fixed=True) is not None for name in FIXED_PHRASES)
    logger.info("voice: %d/%d fixed phrases ready", ready, len(FIXED_PHRASES))
    return ready


def clear_audio_cache() -> None:
    with _cache_lock:
        _AUDIO_CACHE.clear()
        _BY_TEXT.clear()


def text_to_speech(text: str, voice_id: str | None = None) -> bytes | None:
    """Return MP3 bytes for text from ElevenLabs, or None on failure or missing config."""
    api_key = config.ELEVENLABS_API_KEY
    target_voice = voice_id or config.ELEVENLABS_VOICE_ID or "JBFqnCBsd6RMkjVDRZzb"

    if not api_key:
        logger.warning("ELEVENLABS_API_KEY not set; falling back to Twilio <Say>")
        return None

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{target_voice}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": config.ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
        },
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5, context=ssl_context()) as resp:
            if resp.status == 200:
                return resp.read()
            logger.warning("ElevenLabs responded with status %s", resp.status)
    except Exception as exc:
        logger.error("ElevenLabs text-to-speech request failed: %s", exc)

    return None

