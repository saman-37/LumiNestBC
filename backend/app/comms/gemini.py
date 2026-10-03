"""Gemini structured extraction. Owner: Communications (Person 3). Tier 2 STUB.

Gemini only turns words into JSON. It never picks a shelter: ranking is done by
comms/matcher.py on real database rows.

TODO(Communications):
  - pip install google-genai and add it to requirements.txt
  - call the model with a JSON response schema matching the docstrings below
  - validate the output and fall back to the defaults on any error or timeout (~3 s budget)
"""
from .. import config  # noqa: F401  (config.GEMINI_API_KEY)

VOICE_REQUEST_DEFAULTS = {
    "gender": None,
    "age_group": None,
    "family": None,
    "has_pet": None,
    "needs_accessible": None,
    "is_couple": None,
    "area_text": None,
    "language": "en",
}

STAFF_TEXT_DEFAULTS = {
    "open_beds": None,
    "change": None,
    "is_full": None,
    "pets_ok": None,
    "note": None,
}


def extract_voice_request(transcript: str) -> dict:
    """Extract a caller's needs from a speech transcript.

    Returns JSON matching this schema:
        {
          "gender": "woman" | "man" | "nonbinary" | null,
          "age_group": "youth" | "adult" | "senior" | null,
          "family": bool | null,
          "has_pet": bool | null,
          "needs_accessible": bool | null,
          "is_couple": bool | null,
          "area_text": string | null,      # e.g. "near Metrotown"
          "language": ISO 639-1 code       # e.g. "en", "fr", "pa", "zh"
        }
    No names or other personal details are extracted or stored.
    """
    # TODO(Communications): replace placeholder with a Gemini call.
    return dict(VOICE_REQUEST_DEFAULTS)


def parse_staff_text(text: str) -> dict:
    """Parse a shelter staff SMS like "2 beds open, no dogs tonight".

    Returns JSON matching this schema:
        {
          "open_beds": int | null,   # absolute count, if stated
          "change": int | null,      # relative change, e.g. +1 / -2
          "is_full": bool | null,
          "pets_ok": bool | null,
          "note": string | null
        }
    """
    # TODO(Communications): replace placeholder with a Gemini call.
    return dict(STAFF_TEXT_DEFAULTS)
