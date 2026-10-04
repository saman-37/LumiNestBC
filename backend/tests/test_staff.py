"""Shelter staff portal: auth, count changes, revert, settings, tags and holds."""
from conftest import STAFF_KEY, add_shelter, add_staff_key, add_tag, open_beds

from app import config


def staff(client, method, path, headers, json=None):
    return client.open(f"/api/staff/shelter-01{path}", method=method, headers=headers, json=json)


def test_needs_a_valid_key(client, db):
    add_shelter(db)
    add_staff_key(db)
    assert client.get("/api/staff/shelter-01").status_code == 403
    assert client.get("/api/staff/shelter-01", headers={"X-Staff-Key": "wrong"}).status_code == 403
    assert client.get("/api/staff/nope", headers={"X-Staff-Key": STAFF_KEY}).status_code == 404
    assert client.get("/api/staff/shelter-01", headers={"X-Staff-Key": STAFF_KEY}).status_code == 200


def test_key_is_stored_hashed(db):
    add_shelter(db)
    add_staff_key(db)
    stored = db.execute("SELECT key_hash FROM staff_keys").fetchone()["key_hash"]
    assert stored != STAFF_KEY and len(stored) == 64


def test_key_for_one_shelter_doesnt_open_another(client, db):
    add_shelter(db)
    add_shelter(db, "shelter-02")
    headers = add_staff_key(db)
    assert client.get("/api/staff/shelter-02", headers=headers).status_code == 403


def test_holds_and_events_need_the_staff_key(client, db):
    add_shelter(db)
    headers = add_staff_key(db)
    client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Org"})
    assert client.get("/api/shelters/shelter-01/holds").status_code == 403
    assert client.get("/api/shelters/shelter-01/events").status_code == 403
    holds = client.get("/api/shelters/shelter-01/holds", headers=headers).json["holds"]
    assert holds[0]["worker_name"] == "Sam"


def test_count_adjust_full_and_open(client, db):
    add_shelter(db, open_beds=2, capacity=5)
    h = add_staff_key(db)
    res = staff(client, "POST", "/count", h, {"open_beds": 4})
    assert res.json["open_beds"] == 4 and res.json["shelter"]["last_update_source"] == "staff"
    assert staff(client, "POST", "/count", h, {"open_beds": 6}).status_code == 400  # over capacity
    assert staff(client, "POST", "/adjust", h, {"delta": -1}).json["open_beds"] == 3
    assert staff(client, "POST", "/adjust", h, {"delta": 2}).status_code == 400
    assert staff(client, "POST", "/full", h).json["open_beds"] == 0
    assert staff(client, "POST", "/open", h, {"open_beds": 2}).json["open_beds"] == 2
    sources = {r["source"] for r in db.execute("SELECT source FROM availability_events").fetchall()}
    assert sources == {"staff"}


def test_adjust_up_stops_at_capacity(client, db):
    add_shelter(db, open_beds=5, capacity=5)
    assert staff(client, "POST", "/adjust", add_staff_key(db), {"delta": 1}).status_code == 409


def test_staff_change_refreshes_freshness(client, db):
    add_shelter(db, open_beds=1)
    db.execute("UPDATE shelters SET last_updated_at = now() - interval '5 hours'")
    res = staff(client, "POST", "/adjust", add_staff_key(db), {"delta": 1})
    assert res.json["shelter"]["freshness"] == "green"


def test_revert_a_tap_once(client, db):
    add_shelter(db, open_beds=2)
    k = add_tag(db)
    h = add_staff_key(db)
    client.post("/api/tags/shelter-01/freed", json={"k": k, "tap_id": "t1"})
    assert open_beds(db) == 3
    events = staff(client, "GET", "", h).json["events"]
    tap = next(e for e in events if e["source"] == "tap")
    assert tap["revertable"]

    res = staff(client, "POST", f"/events/{tap['id']}/revert", h)
    assert res.json["status"] == "reverted" and open_beds(db) == 2
    assert staff(client, "POST", f"/events/{tap['id']}/revert", h).json["error"] == "already_reverted"

    events = staff(client, "GET", "", h).json["events"]
    assert next(e for e in events if e["id"] == tap["id"])["reverted"]
    revert_event = next(e for e in events if e["reverts_event_id"] == tap["id"])
    assert not revert_event["revertable"]
    assert staff(client, "POST", f"/events/{revert_event['id']}/revert", h).status_code == 409


def test_holds_and_old_changes_cannot_be_reverted(client, db):
    add_shelter(db, open_beds=2)
    h = add_staff_key(db)
    client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Org"})
    hold_event = db.execute("SELECT id FROM availability_events WHERE source = 'hold'").fetchone()["id"]
    assert staff(client, "POST", f"/events/{hold_event}/revert", h).json["error"] == "not_revertable"

    staff_event = staff(client, "POST", "/adjust", h, {"delta": 1}).json["event_id"]
    db.execute("UPDATE availability_events SET time = now() - interval '2 hours' WHERE id = %s", (staff_event,))
    assert staff(client, "POST", f"/events/{staff_event}/revert", h).json["error"] == "revert_window_passed"


def test_settings(client, db):
    add_shelter(db)
    h = add_staff_key(db)
    res = staff(client, "PATCH", "/settings", h,
                {"pets_ok": True, "accepting": False, "staff_phone": "+1 (604) 555-0101", "capacity": 12})
    s = res.json["shelter"]
    assert s["pets_ok"] and not s["accepting"] and s["capacity"] == 12 and s["staff_phone"] == "+1 (604) 555-0101"
    assert staff(client, "PATCH", "/settings", h, {"staff_phone": "123"}).json["error"] == "invalid_phone"
    assert staff(client, "PATCH", "/settings", h, {"accepting": "no"}).status_code == 400
    # Not accepting: no holds.
    hold = client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Org"})
    assert hold.status_code == 409 and hold.json["error"] == "not_accepting"


def test_staff_phone_must_be_unique(client, db):
    add_shelter(db)
    add_shelter(db, "shelter-02", staff_phone="604-555-0101")
    res = staff(client, "PATCH", "/settings", add_staff_key(db), {"staff_phone": "6045550101"})
    assert res.status_code == 409


def test_dv_shelter_never_gets_or_shows_a_staff_phone(client, db):
    add_shelter(db, is_dv=True, dv_phone="604-555-0199", staff_phone="604-555-0000", address="Secret")
    h = add_staff_key(db)
    detail = staff(client, "GET", "", h).json["shelter"]
    assert detail["staff_phone"] is None and detail["address"] is None and detail["lat"] is None
    assert staff(client, "PATCH", "/settings", h, {"staff_phone": "604-555-0101"}).json["error"] == "not_allowed_for_dv"


def test_rotate_tag_kills_old_link(client, db):
    add_shelter(db, open_beds=2)
    old = add_tag(db)
    h = add_staff_key(db)
    res = staff(client, "POST", "/tags/rotate", h, {"action": "freed"})
    freed = next(t for t in res.json["tags"] if t["action"] == "freed")
    new = freed["path"].split("k=")[1]
    assert new != old and freed["url"].startswith(config.TAG_BASE_URL)
    assert client.post("/api/tags/shelter-01/freed", json={"k": old, "tap_id": "t1"}).status_code == 403
    assert client.post("/api/tags/shelter-01/freed", json={"k": new, "tap_id": "t2"}).json["status"] == "applied"


def test_rotate_all_creates_missing_tags(client, db):
    add_shelter(db)
    res = staff(client, "POST", "/tags/rotate", add_staff_key(db), {"action": "all"})
    assert all(t["path"] for t in res.json["tags"]) and len(res.json["tags"]) == 4


def test_release_hold_gives_bed_back(client, db):
    add_shelter(db, open_beds=1)
    h = add_staff_key(db)
    hold = client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam",
                                           "worker_org": "Org"}).json["hold"]
    assert open_beds(db) == 0
    res = staff(client, "DELETE", f"/holds/{hold['id']}", h)
    assert res.json["status"] == "released" and open_beds(db) == 1
    assert staff(client, "DELETE", f"/holds/{hold['id']}", h).status_code == 409


def test_rate_limit(client, db, monkeypatch):
    add_shelter(db)
    monkeypatch.setattr(config, "STAFF_RATE_LIMIT_PER_MINUTE", 3)
    codes = [client.get("/api/staff/shelter-01", headers={"X-Staff-Key": "guess"}).status_code for _ in range(5)]
    assert codes == [403, 403, 403, 429, 429]


def test_admin_key_opens_any_portal_only_with_dev_tools(client, db, monkeypatch):
    add_shelter(db)
    monkeypatch.setattr(config, "ADMIN_KEY", "admin-test-key")
    assert client.get("/api/staff/shelter-01", headers={"X-Admin-Key": "admin-test-key"}).status_code == 200
    monkeypatch.setattr(config, "DEV_TOOLS_ENABLED", False)
    assert client.get("/api/staff/shelter-01", headers={"X-Admin-Key": "admin-test-key"}).status_code == 403


def test_public_shelter_has_last_update_source(client, db):
    add_shelter(db, open_beds=1)
    client.post("/api/holds", json={"shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Org"})
    s = client.get("/api/shelters/shelter-01").json["shelter"]
    assert s["last_update_source"] == "hold" and s["accepting"] is True
