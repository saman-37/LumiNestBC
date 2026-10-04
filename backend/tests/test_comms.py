"""Voice line, formatting and webhook security. No database needed: Gemini and the
shelter loader are replaced with fakes."""
import pytest
from flask import Flask
from twilio.request_validator import RequestValidator

from app import config
from app.comms import twilio_routes
from app.comms.twilio_routes import bed_change, normalize_phone
from app.comms.voice import describe_match, spoken_distance, spoken_phone


def shelter(id, **fields):
    base = {"id": id, "name": f"Shelter {id}", "address": f"{id} Main St", "lat": 49.2276,
            "lng": -123.0076, "open_beds": 2, "is_full": False, "women_only": False,
            "youth": False, "families": False, "pets_ok": False, "accessible": False,
            "couples": False, "is_dv": False, "dv_phone": None, "minutes_since_update": 5}
    return {**base, **fields}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(config, "TWILIO_AUTH_TOKEN", "")
    app = Flask(__name__)
    app.register_blueprint(twilio_routes.bp)
    return app.test_client()


@pytest.fixture
def fake_backend(monkeypatch):
    """Gemini says 'woman near Metrotown'; the DB has one normal and one DV shelter."""
    monkeypatch.setattr(twilio_routes, "extract_voice_request",
                        lambda text: {"gender": "woman", "area_text": "near Metrotown"})
    shelters = [shelter("a", name="Lantern House", open_beds=1),
                shelter("dv", is_dv=True, address=None, lat=None, lng=None, dv_phone="604-555-0199")]
    monkeypatch.setattr(twilio_routes, "load_public_shelters", lambda: shelters)


def call(client, sid="CA1", speech="I'm a woman near Metrotown"):
    heard = client.post("/twilio/voice/heard", data={"CallSid": sid, "SpeechResult": speech})
    answer = client.post("/twilio/voice/answer", data={"CallSid": sid})
    return heard.get_data(as_text=True), answer.get_data(as_text=True)


def test_heard_replies_with_filler_and_redirect_without_calling_gemini(client, monkeypatch):
    monkeypatch.setattr(twilio_routes, "extract_voice_request", lambda text: pytest.fail("too early"))
    heard = client.post("/twilio/voice/heard", data={"CallSid": "CA1", "SpeechResult": "a man"})
    body = heard.get_data(as_text=True)
    assert "One moment" in body and "<Redirect" in body


def test_empty_speech_hangs_up(client):
    body = client.post("/twilio/voice/heard", data={"CallSid": "CA1", "SpeechResult": " "}).get_data(as_text=True)
    assert "didn't catch that" in body and "<Hangup/>" in body


def test_answer_speaks_matches_and_dv_phone_only(client, fake_backend):
    _, body = call(client)
    assert "Lantern House has 1 open bed, less than a kilometre from Burnaby Metrotown" in body
    assert "confidential shelter" in body and "6 0 4, 5 5 5, 0 1 9 9" in body
    assert body.count("<Say") == 2 and body.endswith("<Hangup/></Response>")


def test_transcript_is_forgotten_after_answer(client, fake_backend):
    call(client)
    assert twilio_routes._calls == {}
    again = client.post("/twilio/voice/answer", data={"CallSid": "CA1"}).get_data(as_text=True)
    assert "B C 2 1 1" in again


def test_failure_falls_back_to_bc211(client, fake_backend, monkeypatch):
    def broken():
        raise RuntimeError("db down")
    monkeypatch.setattr(twilio_routes, "load_public_shelters", broken)
    _, body = call(client)
    assert "couldn't find an open bed" in body and "<Hangup/>" in body


def test_match_without_area_reads_naturally():
    line = describe_match({"shelter": shelter("a", open_beds=3, minutes_since_update=0),
                           "distance_km": None}, None)
    assert line == "Shelter a has 3 open beds. The address is a Main St. Their count was updated just now."


def test_dv_without_phone_is_skipped():
    assert describe_match({"shelter": shelter("dv", is_dv=True), "distance_km": None}, "Surrey") is None


@pytest.mark.parametrize("km, spoken", [(0.4, "less than a kilometre"), (1.2, "about 1 kilometre"),
                                        (6.7, "about 7 kilometres")])
def test_spoken_distance(km, spoken):
    assert spoken_distance(km) == spoken


def test_spoken_phone():
    assert spoken_phone("+1 604-555-0199") == "6 0 4, 5 5 5, 0 1 9 9"


@pytest.mark.parametrize("raw", ["+16045550101", "604-555-0101", "(604) 555 0101", "1 604 555 0101"])
def test_normalize_phone(raw):
    assert normalize_phone(raw) == "6045550101"


@pytest.mark.parametrize("parsed, expected", [
    ({"open_beds": 3, "change": None, "is_full": None}, {"set_to": 3}),
    ({"open_beds": None, "change": -1, "is_full": None}, {"delta": -1}),
    ({"open_beds": None, "change": None, "is_full": True}, {"set_to": 0}),
    ({"open_beds": None, "change": None, "is_full": None}, None),
    ({"open_beds": True, "change": "2", "is_full": None}, None),   # wrong types are ignored
])
def test_bed_change(parsed, expected):
    assert bed_change(parsed) == expected


def test_signature_required_when_token_set(client, monkeypatch):
    monkeypatch.setattr(config, "TWILIO_AUTH_TOKEN", "test-token")
    monkeypatch.setattr(config, "BACKEND_PUBLIC_URL", "https://api.example.org")
    params = {"CallSid": "CA1", "SpeechResult": "a man"}

    assert client.post("/twilio/voice/heard", data=params).status_code == 403
    forged = {"X-Twilio-Signature": "bad"}
    assert client.post("/twilio/voice/heard", data=params, headers=forged).status_code == 403

    signature = RequestValidator("test-token").compute_signature(
        "https://api.example.org/twilio/voice/heard", params)
    signed = {"X-Twilio-Signature": signature}
    assert client.post("/twilio/voice/heard", data=params, headers=signed).status_code == 200
