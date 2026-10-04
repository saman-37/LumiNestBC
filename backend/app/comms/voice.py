"""Spoken templates and ElevenLabs text-to-speech. Owner: Communications (Person 3). Tier 2 STUB.

Templates are plain strings so they can be used with Twilio <Say> today and
ElevenLabs audio (<Play>) later.
"""
from .. import config  # noqa: F401  (config.ELEVENLABS_API_KEY, config.ELEVENLABS_VOICE_ID)

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


def text_to_speech(text: str, language: str = "en") -> bytes | None:
    """Return MP3 bytes for text, or None to fall back to Twilio <Say>.

    TODO(Communications): call ElevenLabs (multilingual model, config.ELEVENLABS_VOICE_ID),
    cache the MP3 in memory by id, and serve it from GET /audio/<id>.mp3.
    """
    return None
