"""Bed holds for outreach workers. Owner: Backend (Person 2).

A hold takes one bed for HOLD_MINUTES. It stores only the worker's name and org.
"""
import uuid

from flask import Blueprint, request

from .. import config
from ..availability import change_beds, lock_shelter, mark_arrived, public_shelter, serialize_hold
from ..db import transaction
from ..sockets import emit_shelter_update

bp = Blueprint("holds", __name__)


def _valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False


def _clean(value) -> str:
    return str(value or "").strip()[: config.WORKER_FIELD_MAX_LEN]


@bp.post("/api/holds")
def create_hold():
    body = request.get_json(silent=True) or {}
    shelter_id = _clean(body.get("shelter_id"))
    worker_name = _clean(body.get("worker_name"))
    worker_org = _clean(body.get("worker_org"))
    if not (shelter_id and worker_name and worker_org):
        return {"error": "missing_fields", "required": ["shelter_id", "worker_name", "worker_org"]}, 400

    # One transaction: lock the shelter row, check, decrement, insert hold, log event.
    with transaction() as conn:
        shelter = lock_shelter(conn, shelter_id)
        if shelter is None:
            return {"error": "shelter_not_found"}, 404
        if not shelter["accepting"]:
            return {"error": "not_accepting"}, 409
        if shelter["open_beds"] < 1:
            return {"error": "just_taken"}, 409
        hold = conn.execute(
            "INSERT INTO holds (shelter_id, worker_name, worker_org, expires_at)"
            " VALUES (%s, %s, %s, now() + %s::int * interval '1 minute') RETURNING *",
            (shelter_id, worker_name, worker_org, config.HOLD_MINUTES),
        ).fetchone()
        updated, _ = change_beds(conn, shelter_id, delta=-1, source="hold", hold_id=hold["id"])

    emit_shelter_update(updated)
    return {"hold": serialize_hold(hold), "shelter": public_shelter(updated)}, 201


@bp.get("/api/holds/<hold_id>")
def get_hold(hold_id):
    if not _valid_uuid(hold_id):
        return {"error": "hold_not_found"}, 404
    with transaction() as conn:
        hold = conn.execute("SELECT * FROM holds WHERE id = %s", (hold_id,)).fetchone()
        if hold is None:
            return {"error": "hold_not_found"}, 404
        shelter = conn.execute("SELECT * FROM shelters WHERE id = %s", (hold["shelter_id"],)).fetchone()
    return {"hold": serialize_hold(hold), "shelter": public_shelter(shelter)}


@bp.post("/api/holds/<hold_id>/arrive")
def arrive(hold_id):
    if not _valid_uuid(hold_id):
        return {"error": "hold_not_found"}, 404
    with transaction() as conn:
        hold = conn.execute(
            "SELECT *, expires_at <= now() AS past_expiry FROM holds WHERE id = %s FOR UPDATE", (hold_id,)
        ).fetchone()
        if hold is None:
            return {"error": "hold_not_found"}, 404
        if hold["status"] != "active" or hold["past_expiry"]:
            return {"error": "hold_not_active", "status": hold["status"]}, 409
        hold, updated = mark_arrived(conn, hold_id)

    emit_shelter_update(updated)
    return {"status": "arrived", "hold": serialize_hold(hold), "shelter": public_shelter(updated)}


@bp.delete("/api/holds/<hold_id>")
def cancel(hold_id):
    if not _valid_uuid(hold_id):
        return {"error": "hold_not_found"}, 404
    with transaction() as conn:
        hold = conn.execute("SELECT * FROM holds WHERE id = %s FOR UPDATE", (hold_id,)).fetchone()
        if hold is None:
            return {"error": "hold_not_found"}, 404
        if hold["status"] != "active":
            return {"error": "hold_not_active", "status": hold["status"]}, 409
        hold = conn.execute(
            "UPDATE holds SET status = 'cancelled' WHERE id = %s RETURNING *", (hold_id,)
        ).fetchone()
        updated, _ = change_beds(conn, hold["shelter_id"], delta=1, source="hold", hold_id=hold["id"])

    emit_shelter_update(updated)
    return {"status": "cancelled", "hold": serialize_hold(hold), "shelter": public_shelter(updated)}
