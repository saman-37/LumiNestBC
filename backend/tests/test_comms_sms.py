"""Staff SMS updates. Needs the test database (docker compose up -d); Gemini is faked."""
import pytest
from conftest import add_shelter, open_beds

from app import config
from app.comms import twilio_routes


@pytest.fixture(autouse=True)
def no_signature_check(monkeypatch):
    monkeypatch.setattr(config, "TWILIO_AUTH_TOKEN", "")


def text(client, monkeypatch, parsed, sender="+16045550101"):
    monkeypatch.setattr(twilio_routes, "parse_staff_text", lambda body: parsed)
    return client.post("/twilio/sms", data={"From": sender, "Body": "whatever"}).get_data(as_text=True)


def test_sms_sets_count_matching_phone_formats(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", open_beds=1)
    reply = text(client, monkeypatch, {"open_beds": 3})
    assert open_beds(db) == 3 and "now shows 3 open beds" in reply
    event = db.execute("SELECT source, delta FROM availability_events").fetchone()
    assert event == {"source": "sms", "delta": 2}


def test_sms_relative_change_and_full(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", open_beds=2)
    text(client, monkeypatch, {"change": -1})
    assert open_beds(db) == 1
    text(client, monkeypatch, {"is_full": True})
    assert open_beds(db) == 0


def test_unknown_number_changes_nothing(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", open_beds=2)
    reply = text(client, monkeypatch, {"open_beds": 5}, sender="+17785550000")
    assert open_beds(db) == 2 and "isn't set up" in reply


def test_dv_shelter_cannot_update_by_sms(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", is_dv=True, open_beds=2)
    text(client, monkeypatch, {"open_beds": 5})
    assert open_beds(db) == 2


def test_unreadable_text_changes_nothing(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", open_beds=2)
    reply = text(client, monkeypatch, {"open_beds": None, "change": None, "is_full": None})
    assert open_beds(db) == 2 and "couldn't read" in reply
