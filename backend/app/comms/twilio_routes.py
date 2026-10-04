"""Twilio webhooks for the voice line and staff SMS. Owner: Communications (Person 3). Tier 2 STUB.

Planned call flow:
  POST /twilio/voice         greeting + <Gather input="speech">            (works now)
  POST /twilio/voice/heard   SpeechResult -> gemini.extract_voice_request(), filler, <Redirect>
  POST /twilio/voice/answer  matcher.rank_shelters() on real beds -> voice templates -> <Play>/<Say>
  GET  /audio/<id>.mp3       ElevenLabs audio cached by voice.text_to_speech()
  POST /twilio/sms           staff text -> gemini.parse_staff_text() -> bed change (source='sms')

Privacy: never store caller numbers, transcripts or recordings.
TODO(Communications): validate X-Twilio-Signature (twilio.request_validator) once the `twilio`
package is added to requirements.txt.
"""
from xml.sax.saxutils import escape

from flask import Blueprint, Response, request

from .gemini import extract_voice_request, parse_staff_text
from .matcher import rank_shelters
from .voice import cache_audio, get_cached_audio, say, text_to_speech
from .. import config
from ..availability import change_beds, public_shelter
from ..db import transaction
from ..sockets import emit_shelter_update

bp = Blueprint("comms", __name__)

LANGUAGE = "en-CA"

# In-memory storage for active voice requests: CallSid -> parsed request dict
_CALL_REQUESTS: dict[str, dict] = {}


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
    """Parse caller speech, keep request in memory by CallSid, and redirect to answer."""
    call_sid = request.form.get("CallSid", "default")
    speech_result = request.form.get("SpeechResult", "")
    req = extract_voice_request(speech_result)
    _CALL_REQUESTS[call_sid] = req
    return twiml(play_or_say(say("filler")), '<Redirect method="POST">/twilio/voice/answer</Redirect>')


@bp.post("/twilio/voice/answer")
def voice_answer():
    """Load shelters, rank by criteria + proximity, and speak top matches."""
    call_sid = request.form.get("CallSid", "default")
    req = _CALL_REQUESTS.pop(call_sid, {})

    with transaction() as conn:
        rows = conn.execute("SELECT * FROM shelters").fetchall()

    shelters = [public_shelter(r) for r in rows]
    matches = rank_shelters(req, shelters)

    if not matches:
        return twiml(play_or_say(say("no_match")), "<Hangup/>")

    verbs = []
    for m in matches:
        s = m["shelter"]
        if s["is_dv"]:
            verbs.append(play_or_say(say("dv", phone=s.get("dv_phone") or "2 1 1")))
        else:
            beds_word = "bed" if s["open_beds"] == 1 else "beds"
            dist_str = f"{round(m['distance_km'], 1)} kilometers" if m.get("distance_km") is not None else "a short distance"
            area_str = req.get("area_text") or "your location"
            verbs.append(play_or_say(say(
                "match",
                name=s["name"],
                open_beds=s["open_beds"],
                beds_word=beds_word,
                distance=dist_str,
                area=area_str,
                address=s.get("address") or "the front desk",
                minutes=s.get("minutes_since_update", 0),
            )))

    verbs.append("<Hangup/>")
    return twiml(*verbs)


@bp.get("/audio/<audio_id>.mp3")
def audio(audio_id):
    """Return cached ElevenLabs MP3 for audio_id."""
    data = get_cached_audio(audio_id)
    if not data:
        return {"error": "audio_not_found"}, 404
    return Response(data, mimetype="audio/mpeg")


@bp.post("/twilio/sms")
def sms():
    """Match From phone to shelter staff_phone, parse text, apply bed changes."""
    from_number = request.form.get("From", "").strip()
    body_text = request.form.get("Body", "").strip()

    if not from_number or not body_text:
        return twiml("<Message>Please send a valid bed count update.</Message>")

    # Clean incoming phone number for matching
    digits = "".join(filter(str.isdigit, from_number))
    parsed = parse_staff_text(body_text)

    updated_shelter = None
    with transaction() as conn:
        # Match staff phone
        shelter = conn.execute(
            "SELECT * FROM shelters WHERE regexp_replace(staff_phone, '[^0-9]', '', 'g') LIKE %s LIMIT 1",
            (f"%{digits[-10:]}",),
        ).fetchone()

        if not shelter:
            return twiml("<Message>Unrecognized staff phone number. Please contact your administrator.</Message>")

        shelter_id = shelter["id"]
        if parsed.get("open_beds") is not None:
            updated_shelter, _ = change_beds(conn, shelter_id, set_to=parsed["open_beds"], source="sms", staff_update=True)
        elif parsed.get("change") is not None:
            updated_shelter, _ = change_beds(conn, shelter_id, delta=parsed["change"], source="sms", staff_update=True)
        elif parsed.get("is_full"):
            updated_shelter, _ = change_beds(conn, shelter_id, set_to=0, source="sms", staff_update=True)

    if updated_shelter:
        emit_shelter_update(updated_shelter)
        return twiml(f"<Message>Updated {updated_shelter['name']}: {updated_shelter['open_beds']} open beds.</Message>")

    return twiml("<Message>Received update, but could not determine bed change amount.</Message>")

