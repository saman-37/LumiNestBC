from conftest import add_shelter, add_tag, open_beds, rewind_tag


def tap(client, action, k, tap_id, shelter_id="shelter-01"):
    return client.post(f"/api/tags/{shelter_id}/{action}", json={"k": k, "tap_id": tap_id})


def test_tap_applies_change(client, db):
    add_shelter(db, open_beds=2)
    k = add_tag(db)
    res = tap(client, "freed", k, "tap-1")
    assert res.status_code == 200
    assert res.json["status"] == "applied"
    assert res.json["open_beds"] == 3
    assert open_beds(db) == 3


def test_wrong_secret_rejected(client, db):
    add_shelter(db, open_beds=2)
    add_tag(db)
    res = tap(client, "freed", "wrong", "tap-1")
    assert res.status_code == 403
    assert open_beds(db) == 2


def test_same_tag_within_cooldown_is_ignored(client, db):
    add_shelter(db, open_beds=2)
    k = add_tag(db)
    assert tap(client, "freed", k, "tap-1").json["open_beds"] == 3

    second = tap(client, "freed", k, "tap-2")
    assert second.json["status"] == "ignored_cooldown"
    assert second.json["open_beds"] == 3

    rewind_tag(db)
    third = tap(client, "freed", k, "tap-3")
    assert third.json["status"] == "applied"
    assert open_beds(db) == 4


def test_repeated_tap_id_is_ignored(client, db):
    add_shelter(db, open_beds=2)
    k = add_tag(db)
    assert tap(client, "freed", k, "tap-1").json["status"] == "applied"
    rewind_tag(db)  # make sure it's the tap_id, not the cooldown, that blocks it

    again = tap(client, "freed", k, "tap-1")
    assert again.json["status"] == "duplicate"
    assert open_beds(db) == 3


def test_full_sets_zero_and_undo_restores(client, db):
    add_shelter(db, open_beds=4)
    k = add_tag(db, action="full")
    res = tap(client, "full", k, "tap-1")
    assert res.json["open_beds"] == 0
    assert res.json["shelter"]["is_full"] is True

    undone = client.post("/api/undo", json={"tap_id": "tap-1"})
    assert undone.json["status"] == "undone"
    assert open_beds(db) == 4
    assert client.post("/api/undo", json={"tap_id": "tap-1"}).status_code == 409


def test_arrive_confirms_single_active_hold(client, db):
    add_shelter(db, open_beds=2)
    k = add_tag(db, action="arrive")
    hold = client.post("/api/holds", json={
        "shelter_id": "shelter-01", "worker_name": "Sam", "worker_org": "Outreach Co"}).json["hold"]

    res = tap(client, "arrive", k, "tap-1")
    assert res.json["status"] == "arrived"
    assert res.json["hold"]["id"] == hold["id"]
    assert open_beds(db) == 1  # bed was taken by the hold, arrival doesn't change it
