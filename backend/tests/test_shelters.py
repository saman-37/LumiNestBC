from conftest import add_shelter

from app.availability import public_shelter


def test_dv_shelter_never_returns_coordinates(client, db):
    # Even if coordinates were stored by mistake, they must never leave the server.
    add_shelter(db, "shelter-dv", address="99 Secret Lane", lat=49.123456, lng=-123.654321,
                is_dv=True, dv_phone="604-555-0199", staff_phone="604-555-0000")
    add_shelter(db, "shelter-01")

    res = client.get("/api/shelters")
    dv = next(s for s in res.json["shelters"] if s["id"] == "shelter-dv")
    assert dv["lat"] is None and dv["lng"] is None and dv["address"] is None
    assert dv["staff_phone"] is None
    assert dv["dv_phone"] == "604-555-0199"
    raw = res.get_data(as_text=True)
    assert "Secret Lane" not in raw and "49.123456" not in raw and "123.654321" not in raw

    single = client.get("/api/shelters/shelter-dv").json["shelter"]
    assert single["lat"] is None and single["address"] is None

    hold = client.post("/api/holds", json={
        "shelter_id": "shelter-dv", "worker_name": "Sam", "worker_org": "Outreach Co"}).json
    assert hold["shelter"]["lat"] is None and hold["shelter"]["address"] is None


def test_dv_socket_payload_has_no_coordinates(db):
    add_shelter(db, "shelter-dv", address="99 Secret Lane", lat=49.1, lng=-123.1, is_dv=True)
    row = db.execute("SELECT * FROM shelters WHERE id = 'shelter-dv'").fetchone()
    payload = public_shelter(row)
    assert payload["lat"] is None and payload["lng"] is None and payload["address"] is None


def test_freshness_field(client, db):
    add_shelter(db, "fresh")
    add_shelter(db, "aging")
    db.execute("UPDATE shelters SET last_updated_at = now() - interval '90 minutes' WHERE id = 'aging'")
    add_shelter(db, "stale")
    db.execute("UPDATE shelters SET last_updated_at = now() - interval '4 hours' WHERE id = 'stale'")
    by_id = {s["id"]: s for s in client.get("/api/shelters").json["shelters"]}
    assert by_id["fresh"]["freshness"] == "green"
    assert by_id["aging"]["freshness"] == "amber"
    assert by_id["stale"]["freshness"] == "red"
    assert by_id["stale"]["minutes_since_update"] >= 239
