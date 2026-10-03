"""Read-only shelter endpoints. Owner: Backend (Person 2).

GET requests never change data.
"""
from datetime import datetime, timezone

from flask import Blueprint, request

from ..availability import iso, public_shelter, serialize_hold
from ..db import transaction

bp = Blueprint("shelters", __name__)


@bp.get("/api/shelters")
def list_shelters():
    with transaction() as conn:
        rows = conn.execute("SELECT * FROM shelters ORDER BY name").fetchall()
    now = datetime.now(timezone.utc)
    return {"shelters": [public_shelter(r, now) for r in rows], "generated_at": iso(now)}


@bp.get("/api/shelters/<shelter_id>")
def get_shelter(shelter_id):
    with transaction() as conn:
        row = conn.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,)).fetchone()
    if row is None:
        return {"error": "shelter_not_found"}, 404
    return {"shelter": public_shelter(row)}


# TODO(Backend): the staff dashboard has no auth yet. Before real use, require the
# shelter's tag secret (?k=) or similar so worker names aren't visible to anyone.
@bp.get("/api/shelters/<shelter_id>/holds")
def shelter_holds(shelter_id):
    with transaction() as conn:
        rows = conn.execute(
            "SELECT * FROM holds WHERE shelter_id = %s AND status = 'active' ORDER BY expires_at",
            (shelter_id,),
        ).fetchall()
    return {"holds": [serialize_hold(r) for r in rows]}


@bp.get("/api/shelters/<shelter_id>/events")
def shelter_events(shelter_id):
    limit = min(max(request.args.get("limit", 20, type=int), 1), 100)
    with transaction() as conn:
        rows = conn.execute(
            "SELECT time, delta, open_beds_after, source FROM availability_events"
            " WHERE shelter_id = %s ORDER BY time DESC LIMIT %s",
            (shelter_id, limit),
        ).fetchall()
    return {"events": [{**r, "time": iso(r["time"])} for r in rows]}
