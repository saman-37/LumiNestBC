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

from flask import Blueprint, Response

from .voice import say

bp = Blueprint("comms", __name__)

LANGUAGE = "en-CA"


def twiml(*verbs: str) -> Response:
    body = '<?xml version="1.0" encoding="UTF-8"?><Response>' + "".join(verbs) + "</Response>"
    return Response(body, mimetype="text/xml")


def say_verb(text: str) -> str:
    return f'<Say language="{LANGUAGE}">{escape(text)}</Say>'


@bp.post("/twilio/voice")
def voice_start():
    """Answer the call: greet, then listen for the caller's needs."""
    return twiml(
        say_verb(say("greeting")),
        f'<Gather input="speech" action="/twilio/voice/heard" method="POST" '
        f'speechTimeout="auto" language="{LANGUAGE}">{say_verb(say("prompt"))}</Gather>',
        say_verb(say("no_speech")),
    )


@bp.post("/twilio/voice/heard")
def voice_heard():
    """TODO(Communications): read request.form["SpeechResult"], call extract_voice_request(),
    keep the result in memory keyed by CallSid (never in the database), then redirect."""
    return twiml(say_verb(say("filler")), '<Redirect method="POST">/twilio/voice/answer</Redirect>')


@bp.post("/twilio/voice/answer")
def voice_answer():
    """TODO(Communications): load shelters, rank_shelters(), speak top 2 (DV -> say("dv", phone=...))."""
    return twiml(say_verb(say("not_ready")), "<Hangup/>")


@bp.get("/audio/<audio_id>.mp3")
def audio(audio_id):
    """TODO(Communications): return cached ElevenLabs MP3 for audio_id."""
    return {"error": "not_implemented", "tier": 2}, 501


@bp.post("/twilio/sms")
def sms():
    """TODO(Communications): match From to shelters.staff_phone, parse_staff_text(),
    apply via availability.change_beds(source='sms', staff_update=True), reply with the new count."""
    return twiml("<Message>Thanks! SMS updates for LuminestBC are coming soon.</Message>")
