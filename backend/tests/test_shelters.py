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


def test_public_phone_shown_for_shelters_but_never_for_dv(client, db):
    add_shelter(db, "shelter-01", public_phone="604-264-1680")
    add_shelter(db, "dv", is_dv=True, address=None, lat=None, lng=None, dv_phone="604-555-0199",
                public_phone="604-555-0000")
    shelters = {s["id"]: s for s in client.get("/api/shelters").json["shelters"]}
    assert shelters["shelter-01"]["public_phone"] == "604-264-1680"
    assert shelters["dv"]["public_phone"] is None and shelters["dv"]["dv_phone"] == "604-555-0199"


def test_large_api_responses_are_gzipped_when_asked(client, db):
    import gzip
    import json
    for i in range(30):
        add_shelter(db, f"shelter-{i:02d}")
    plain = client.get("/api/shelters")
    assert "Content-Encoding" not in plain.headers
    zipped = client.get("/api/shelters", headers={"Accept-Encoding": "gzip, br"})
    assert zipped.headers["Content-Encoding"] == "gzip" and "Accept-Encoding" in zipped.headers["Vary"]
    assert json.loads(gzip.decompress(zipped.data))["shelters"] == plain.json["shelters"]


def test_dev_server_accepts_lan_socket_origins_but_production_does_not():
    from app import socket_origins
    from app import config as cfg
    production = socket_origins(False)
    assert production(cfg.FRONTEND_ORIGINS[0]) and not production("http://192.168.1.20:5173")
    allowed = socket_origins(True)
    assert allowed("http://172.16.164.201:5173") and allowed("http://192.168.1.20:5173")
    assert allowed(cfg.FRONTEND_ORIGINS[0])
    assert not allowed("https://evil.example.com") and not allowed("http://8.8.8.8:5173") and not allowed(None)
