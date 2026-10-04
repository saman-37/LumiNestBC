import json
import logging
import re
import urllib.request

from .. import config

logger = logging.getLogger(__name__)

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


def _heuristic_voice_extract(transcript: str) -> dict:
    """Fast regex/keyword extractor that works offline or without a Gemini API key."""
    res = dict(VOICE_REQUEST_DEFAULTS)
    t = transcript.lower()

    if re.search(r"\b(woman|women|female)\b", t):
        res["gender"] = "woman"
    elif re.search(r"\b(man|men|male)\b", t):
        res["gender"] = "man"
    elif re.search(r"\b(nonbinary|enby|they)\b", t):
        res["gender"] = "nonbinary"

    if re.search(r"\b(youth|teen|teenager|young)\b", t):
        res["age_group"] = "youth"
    elif re.search(r"\b(senior|elderly|older)\b", t):
        res["age_group"] = "senior"

    if re.search(r"\b(family|child|children|kids|baby)\b", t):
        res["family"] = True
    if re.search(r"\b(pet|dog|cat|animal|puppy|kitten)\b", t):
        res["has_pet"] = True
    if re.search(r"\b(wheelchair|accessible|handicap|disabled|mobility|walker|cane|crutch|crutches)\b", t):
        res["needs_accessible"] = True
    if re.search(r"\b(couple|partner|wife|husband|together)\b", t):
        res["is_couple"] = True

    # Look for area mentions
    area_match = re.search(r"\b(near|in|around|at)\s+([a-zA-Z\s]{3,25})", transcript, re.IGNORECASE)
    if area_match:
        res["area_text"] = area_match.group(0).strip()

    return res


def _heuristic_staff_text(text: str) -> dict:
    """Extract staff SMS counts and notes with regex."""
    res = dict(STAFF_TEXT_DEFAULTS)
    t = text.lower()

    if re.search(r"\b(full|no beds|zero beds|0 beds)\b", t):
        res["is_full"] = True
        res["open_beds"] = 0

    change_match = re.search(r"([+-]\d+)\s*(beds?|spots?)?", t)
    if change_match:
        res["change"] = int(change_match.group(1))

    abs_match = re.search(r"\b(\d+)\s*(beds?|spots?)\s*(open|free|available)?\b", t)
    if abs_match:
        res["open_beds"] = int(abs_match.group(1))
        res["is_full"] = res["open_beds"] == 0

    if "no dog" in t or "no pet" in t or "no cats" in t:
        res["pets_ok"] = False
    elif "pets ok" in t or "dogs ok" in t:
        res["pets_ok"] = True

    res["note"] = text.strip()
    return res


def extract_voice_request(transcript: str) -> dict:
    """Extract a caller's needs from a speech transcript using Gemini or heuristic fallback."""
    if not transcript or not transcript.strip():
        return dict(VOICE_REQUEST_DEFAULTS)

    api_key = config.GEMINI_API_KEY
    if not api_key:
        return _heuristic_voice_extract(transcript)

    prompt = (
        "Extract the caller's shelter needs from this transcript into valid JSON matching this schema: "
        '{"gender": "woman"|"man"|"nonbinary"|null, "age_group": "youth"|"adult"|"senior"|null, '
        '"family": boolean|null, "has_pet": boolean|null, "needs_accessible": boolean|null, '
        '"is_couple": boolean|null, "area_text": string|null, "language": "en"}. '
        "Return ONLY the JSON object. Do not extract names or personal details.\n"
        f"Transcript: {transcript}"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"},
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
            out = dict(VOICE_REQUEST_DEFAULTS)
            out.update(parsed)
            return out
    except Exception as exc:
        logger.warning("Gemini voice extraction failed (%s); using heuristic fallback", exc)
        return _heuristic_voice_extract(transcript)


def parse_staff_text(text: str) -> dict:
    """Parse a shelter staff SMS into structured updates."""
    if not text or not text.strip():
        return dict(STAFF_TEXT_DEFAULTS)

    api_key = config.GEMINI_API_KEY
    if not api_key:
        return _heuristic_staff_text(text)

    prompt = (
        "Parse this shelter staff SMS update into JSON with schema: "
        '{"open_beds": int|null, "change": int|null, "is_full": boolean|null, "pets_ok": boolean|null, "note": string|null}. '
        "Return ONLY valid JSON.\n"
        f"SMS: {text}"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"response_mime_type": "application/json"},
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            parsed_text = data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(parsed_text)
            out = dict(STAFF_TEXT_DEFAULTS)
            out.update(parsed)
            return out
    except Exception as exc:
        logger.warning("Gemini staff parse failed (%s); using heuristic fallback", exc)
        return _heuristic_staff_text(text)

