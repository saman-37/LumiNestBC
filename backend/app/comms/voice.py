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
        "{name} has {open_beds} open {beds_word}, about {distance} from {area}. "
        "The address is {address}. Their count was updated {minutes} minutes ago."
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


def text_to_speech(text: str, language: str = "en") -> bytes | None:
    """Return MP3 bytes for text, or None to fall back to Twilio <Say>.

    TODO(Communications): call ElevenLabs (multilingual model, config.ELEVENLABS_VOICE_ID),
    cache the MP3 in memory by id, and serve it from GET /audio/<id>.mp3.
    """
    return None
