import threading

from conftest import add_shelter, open_beds

from app.jobs import expire_holds

WORKER = {"worker_name": "Sam", "worker_org": "Outreach Co"}


def test_two_simultaneous_holds_on_last_bed_only_one_succeeds(app, db):
    add_shelter(db, open_beds=1)
    barrier = threading.Barrier(2)
    statuses = []

    def grab():
        client = app.test_client()
        barrier.wait()
        res = client.post("/api/holds", json={"shelter_id": "shelter-01", **WORKER})
        statuses.append((res.status_code, res.json))

    threads = [threading.Thread(target=grab) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    codes = sorted(code for code, _ in statuses)
    assert codes == [201, 409]
    assert [body for code, body in statuses if code == 409][0] == {"error": "just_taken"}
    assert open_beds(db) == 0
    assert db.execute("SELECT count(*) AS n FROM holds").fetchone()["n"] == 1


def test_cancel_restores_bed(client, db):
    add_shelter(db, open_beds=1)
    hold = client.post("/api/holds", json={"shelter_id": "shelter-01", **WORKER}).json["hold"]
    assert open_beds(db) == 0
    assert client.delete(f"/api/holds/{hold['id']}").json["status"] == "cancelled"
    assert open_beds(db) == 1


def test_expiry_job_restores_bed(client, db):
    add_shelter(db, open_beds=1)
    hold = client.post("/api/holds", json={"shelter_id": "shelter-01", **WORKER}).json["hold"]
    db.execute("UPDATE holds SET expires_at = now() - interval '1 minute' WHERE id = %s", (hold["id"],))
    assert expire_holds() == 1
    assert open_beds(db) == 1
    assert client.get(f"/api/holds/{hold['id']}").json["hold"]["status"] == "expired"
