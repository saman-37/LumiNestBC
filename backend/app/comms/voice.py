import json
import logging
import urllib.request
import uuid

from .. import config

logger = logging.getLogger(__name__)

# In-memory cache for generated MP3 audio chunks: audio_id -> bytes
_AUDIO_CACHE: dict[str, bytes] = {}

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
    _AUDIO_CACHE[audio_id] = audio_bytes
    return audio_id


def get_cached_audio(audio_id: str) -> bytes | None:
    """Retrieve cached MP3 bytes by audio ID."""
    return _AUDIO_CACHE.get(audio_id)


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
        "model_id": "eleven_multilingual_v2",
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
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return resp.read()
            logger.warning("ElevenLabs responded with status %s", resp.status)
    except Exception as exc:
        logger.error("ElevenLabs text-to-speech request failed: %s", exc)

    return None

