"""Admin / test hub and the voice + SMS simulators."""
import pytest
from conftest import add_shelter, open_beds

from app import config
from app.comms import twilio_routes

ADMIN = {"X-Admin-Key": "admin-test-key"}


@pytest.fixture(autouse=True)
def admin_key(monkeypatch):
    monkeypatch.setattr(config, "ADMIN_KEY", "admin-test-key")
    monkeypatch.setattr(config, "DEV_TOOLS_ENABLED", True)
    monkeypatch.setattr(config, "ELEVENLABS_API_KEY", "")  # no real TTS in tests


def test_admin_needs_key_and_dev_tools(client, db, monkeypatch):
    assert client.get("/api/admin/shelters").status_code == 403
    assert client.get("/api/admin/shelters", headers={"X-Admin-Key": "nope"}).status_code == 403
    assert client.get("/api/admin/shelters", headers=ADMIN).status_code == 200
    monkeypatch.setattr(config, "DEV_TOOLS_ENABLED", False)
    assert client.get("/api/admin/shelters", headers=ADMIN).status_code == 404


def test_admin_without_admin_key_configured(client, db, monkeypatch):
    monkeypatch.setattr(config, "ADMIN_KEY", "")
    assert client.get("/api/admin/shelters", headers=ADMIN).json["error"] == "admin_key_not_set"


def test_admin_lists_shelters_with_tag_links_and_no_dv_location(client, db):
    add_shelter(db)
    add_shelter(db, "dv", is_dv=True, address="Secret", dv_phone="604-555-0199")
    shelters = {s["id"]: s for s in client.get("/api/admin/shelters", headers=ADMIN).json["shelters"]}
    assert len(shelters["shelter-01"]["tags"]) == 4
    assert shelters["dv"]["address"] is None and shelters["dv"]["lat"] is None


def test_reset_stale_and_expire(client, db):
    add_shelter(db, open_beds=1)
    client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Org"})
    assert client.post("/api/admin/expire-holds", headers=ADMIN).json["expired"] == 1
    assert open_beds(db) == 1
    stale = client.post("/api/admin/shelters/shelter-01/stale", headers=ADMIN).json["shelter"]
    assert stale["freshness"] == "red"
    assert client.post("/api/admin/reset-demo", headers=ADMIN).json["shelters"] == 1


def test_voice_simulator_runs_the_real_pipeline(client, db, monkeypatch):
    add_shelter(db, name="Lantern House", open_beds=2, lat=49.2276, lng=-123.0076, women_only=True)
    monkeypatch.setattr(twilio_routes, "extract_voice_request",
                        lambda text: {"gender": "woman", "area_text": "near Metrotown"})
    res = client.post("/api/dev/voice", headers=ADMIN, json={"transcript": "women's bed near Metrotown"}).json
    assert res["matches"][0]["name"] == "Lantern House"
    assert [l["kind"] for l in res["lines"]] == ["greeting", "filler", "answer"]
    assert "Lantern House has 2 open beds" in res["lines"][2]["text"]
    assert res["voice"] == "twilio_say" and res["lines"][0]["audio_url"] is None
    assert set(res["timings_ms"]) == {"gemini", "ranking", "tts", "total"}


def test_sms_simulator(client, db, monkeypatch):
    add_shelter(db, staff_phone="604-555-0101", open_beds=1)
    monkeypatch.setattr(twilio_routes, "parse_staff_text", lambda body: {"open_beds": 4})
    res = client.post("/api/dev/sms", headers=ADMIN, json={"from": "+16045550101", "body": "4 beds"}).json
    assert res["changed"] and res["delta"] == 3 and "now shows 4 open beds" in res["reply"]
    assert open_beds(db) == 4
