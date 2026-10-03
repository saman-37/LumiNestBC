"""NFC tag taps and undo. Owner: Backend (Person 2).

Each tag stores a plain URL that opens the frontend page /t/<shelter_id>/<action>?k=<secret>.
Only that page's POST changes data, so link previews and prefetching can't cause phantom taps.
"""
import hmac

from flask import Blueprint, request

from .. import config
from ..availability import change_beds, mark_arrived, public_shelter, serialize_hold
from ..db import transaction
from ..sockets import emit_shelter_update

bp = Blueprint("tags", __name__)

ACTIONS = ("freed", "filled", "full", "arrive")
BED_CHANGES = {"freed": {"delta": 1}, "filled": {"delta": -1}, "full": {"set_to": 0}}


def _current(conn, shelter_id, action, tap_id, status):
    row = conn.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,)).fetchone()
    shelter = public_shelter(row)
    return {"status": status, "action": action, "tap_id": tap_id,
            "open_beds": shelter["open_beds"], "shelter": shelter}


def _arrive(conn, shelter_id):
    """Confirm the single active hold, or ask the page to choose if there are several."""
    holds = conn.execute(
        "SELECT * FROM holds WHERE shelter_id = %s AND status = 'active' AND expires_at > now()"
        " ORDER BY expires_at FOR UPDATE",
        (shelter_id,),
    ).fetchall()
    if not holds:
        return {"status": "no_active_holds"}, None
    if len(holds) > 1:
        return {"status": "choose_hold", "holds": [serialize_hold(h) for h in holds]}, None
    hold, shelter = mark_arrived(conn, holds[0]["id"])
    return {"status": "arrived", "hold": serialize_hold(hold)}, shelter


@bp.post("/api/tags/<shelter_id>/<action>")
def tap(shelter_id, action):
    if action not in ACTIONS:
        return {"error": "unknown_action"}, 404
    body = request.get_json(silent=True) or {}
    k = str(body.get("k") or "")
    tap_id = str(body.get("tap_id") or "")
    if not k or not tap_id or len(tap_id) > 64:
        return {"error": "missing_k_or_tap_id"}, 400

    updated = None
    with transaction() as conn:
        tag = conn.execute(
            "SELECT id, secret,"
            " (last_tap_at IS NOT NULL AND last_tap_at > now() - %s::int * interval '1 second') AS cooling"
            " FROM tags WHERE shelter_id = %s AND action = %s FOR UPDATE",
            (config.TAG_COOLDOWN_SECONDS, shelter_id, action),
        ).fetchone()
        if tag is None or not hmac.compare_digest(tag["secret"].encode(), k.encode()):
            return {"error": "invalid_tag"}, 403

        first_time = conn.execute(
            "INSERT INTO processed_taps (tap_id, shelter_id, action) VALUES (%s, %s, %s)"
            " ON CONFLICT (tap_id) DO NOTHING RETURNING tap_id",
            (tap_id, shelter_id, action),
        ).fetchone()
        if first_time is None:
            return _current(conn, shelter_id, action, tap_id, "duplicate")
        if tag["cooling"]:
            return _current(conn, shelter_id, action, tap_id, "ignored_cooldown")

        conn.execute("UPDATE tags SET last_tap_at = now() WHERE id = %s", (tag["id"],))
        if action == "arrive":
            result, updated = _arrive(conn, shelter_id)
        else:
            updated, applied = change_beds(conn, shelter_id, source="tap", staff_update=True,
                                           **BED_CHANGES[action])
            conn.execute("UPDATE processed_taps SET delta = %s WHERE tap_id = %s", (applied, tap_id))
            result = {"status": "applied", "delta": applied, "undo_seconds": config.UNDO_WINDOW_SECONDS}
        if updated is None:
            updated = conn.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,)).fetchone()
            changed = False
        else:
            changed = True

    if changed:
        emit_shelter_update(updated)
    shelter = public_shelter(updated)
    return {**result, "action": action, "tap_id": tap_id,
            "open_beds": shelter["open_beds"], "shelter": shelter}


@bp.post("/api/undo")
def undo():
    body = request.get_json(silent=True) or {}
    tap_id = str(body.get("tap_id") or "")
    if not tap_id:
        return {"error": "missing_tap_id"}, 400

    with transaction() as conn:
        tap_row = conn.execute(
            "SELECT *, created_at > now() - %s::int * interval '1 second' AS in_window"
            " FROM processed_taps WHERE tap_id = %s FOR UPDATE",
            (config.UNDO_WINDOW_SECONDS, tap_id),
        ).fetchone()
        if tap_row is None:
            return {"error": "tap_not_found"}, 404
        if tap_row["undone_at"] is not None:
            return {"error": "already_undone"}, 409
        if not tap_row["in_window"]:
            return {"error": "undo_window_passed"}, 409
        if tap_row["delta"] == 0:
            # Nothing changed (ignored tap, arrival, or a no-op like "filled" at 0).
            return {"status": "nothing_to_undo", "tap_id": tap_id}
        updated, applied = change_beds(conn, tap_row["shelter_id"], delta=-tap_row["delta"],
                                       source="undo", staff_update=True)
        conn.execute("UPDATE processed_taps SET undone_at = now() WHERE tap_id = %s", (tap_id,))

    emit_shelter_update(updated)
    shelter = public_shelter(updated)
    return {"status": "undone", "tap_id": tap_id, "delta": applied,
            "open_beds": shelter["open_beds"], "shelter": shelter}
