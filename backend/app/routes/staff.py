"""Shelter staff portal. Owner: Backend (Person 2).

Every endpoint needs the shelter's private key in the X-Staff-Key header (or the admin key
in X-Admin-Key while dev tools are on). Bed changes go through change_beds() with
source='staff' and staff_update=True, are logged, and are broadcast as shelter_update.
"""
import re
import secrets
import string
import uuid
from functools import wraps

from flask import Blueprint, request

from .. import config
from ..auth import admin_key_valid, limiter, staff_key_valid
from ..availability import change_beds_logged, iso, public_shelter, serialize_hold
from ..db import transaction
from ..sockets import emit_shelter_update

bp = Blueprint("staff", __name__)

TAG_ACTIONS = ("freed", "filled", "full", "arrive")
TAG_LABELS = {"freed": "Bed freed (+1)", "filled": "Bed filled (−1)", "full": "We're full (0)",
              "arrive": "Arrival (by the door)"}
REVERTABLE_SOURCES = ("tap", "sms", "staff")
MAX_BEDS = 1000
_SECRET_ALPHABET = string.ascii_letters + string.digits


def require_staff(fn):
    """Rate limit, then 404 for an unknown shelter, then 403 without a valid key."""
    @wraps(fn)
    def wrapper(shelter_id, *args, **kwargs):
        if not limiter.allow(f"shelter:{shelter_id}", config.STAFF_RATE_LIMIT_PER_MINUTE):
            return {"error": "rate_limited"}, 429
        with transaction() as conn:
            exists = conn.execute("SELECT 1 FROM shelters WHERE id = %s", (shelter_id,)).fetchone()
            if exists is None:
                return {"error": "shelter_not_found"}, 404
            is_admin = admin_key_valid(request.headers.get("X-Admin-Key", ""))
            if not is_admin and not staff_key_valid(conn, shelter_id, request.headers.get("X-Staff-Key", "")):
                return {"error": "invalid_staff_key"}, 403
            if request.method != "GET" and not is_admin:  # GET never changes data
                conn.execute("UPDATE staff_keys SET last_used_at = now() WHERE shelter_id = %s", (shelter_id,))
        return fn(shelter_id, *args, **kwargs)
    return wrapper


# --- Serializers --------------------------------------------------------------------

def serialize_event(row: dict) -> dict:
    revertable = (
        row["source"] in REVERTABLE_SOURCES and row["delta"] != 0 and row["reverted_at"] is None
        and row["reverts_event_id"] is None and row["recent"]
    )
    return {
        "id": row["id"],
        "time": iso(row["time"]),
        "delta": row["delta"],
        "open_beds_after": row["open_beds_after"],
        "source": row["source"],
        "reverted": row["reverted_at"] is not None,
        "reverts_event_id": row["reverts_event_id"],
        "revertable": revertable,
        # Whose hold this was (hold, arrival, expiry, release); staff-key only, like the holds list.
        "hold": ({"id": str(row["hold_id"]), "worker_name": row["worker_name"], "worker_org": row["worker_org"]}
                 if row.get("hold_id") else None),
    }


def load_events(conn, shelter_id: str, limit: int) -> list[dict]:
    rows = conn.execute(
        "SELECT e.id, e.time, e.delta, e.open_beds_after, e.source, e.reverted_at, e.reverts_event_id,"
        " e.hold_id, h.worker_name, h.worker_org,"
        " e.time > now() - %s::int * interval '1 minute' AS recent"
        " FROM availability_events e LEFT JOIN holds h ON h.id = e.hold_id"
        " WHERE e.shelter_id = %s ORDER BY e.time DESC, e.id DESC LIMIT %s",
        (config.STAFF_REVERT_WINDOW_MINUTES, shelter_id, limit),
    ).fetchall()
    return [serialize_event(r) for r in rows]


def load_holds(conn, shelter_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM holds WHERE shelter_id = %s AND status = 'active' ORDER BY expires_at", (shelter_id,)
    ).fetchall()
    return [serialize_hold(r) for r in rows]


def load_tags(conn, shelter_id: str) -> list[dict]:
    rows = {
        r["action"]: r for r in conn.execute(
            "SELECT action, secret, last_tap_at,"
            " floor(extract(epoch FROM now() - last_tap_at) / 60)::int AS minutes_since_tap"
            " FROM tags WHERE shelter_id = %s", (shelter_id,)
        ).fetchall()
    }
    tags = []
    for action in TAG_ACTIONS:
        row = rows.get(action)
        path = f"/t/{shelter_id}/{action}?k={row['secret']}" if row else None
        tags.append({
            "action": action,
            "label": TAG_LABELS[action],
            "path": path,
            "url": f"{config.TAG_BASE_URL}{path}" if path else None,
            "last_tap_at": iso(row["last_tap_at"]) if row else None,
            "minutes_since_tap": row["minutes_since_tap"] if row else None,
        })
    return tags


def _applied(updated: dict, applied: int, event_id: int, **extra) -> dict:
    return {"status": "applied", "delta": applied, "event_id": event_id,
            "open_beds": updated["open_beds"], "shelter": public_shelter(updated), **extra}


def _int(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _within_capacity(shelter: dict, count: int) -> bool:
    limit = shelter["capacity"] or MAX_BEDS  # capacity 0 = unknown
    return 0 <= count <= limit


def _staff_change(shelter_id: str, **change) -> tuple[dict, int]:
    """Apply a staff bed change, broadcast it, and return the JSON response."""
    with transaction() as conn:
        updated, applied, event_id = change_beds_logged(
            conn, shelter_id, source="staff", staff_update=True, **change)
    emit_shelter_update(updated)
    return _applied(updated, applied, event_id), 200


def _shelter_row(shelter_id: str) -> dict:
    with transaction() as conn:
        return conn.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,)).fetchone()


# --- Endpoints ----------------------------------------------------------------------

@bp.get("/api/staff/<shelter_id>")
@require_staff
def detail(shelter_id):
    with transaction() as conn:
        shelter = conn.execute("SELECT * FROM shelters WHERE id = %s", (shelter_id,)).fetchone()
        return {
            "shelter": public_shelter(shelter),
            "holds": load_holds(conn, shelter_id),
            "events": load_events(conn, shelter_id, config.STAFF_EVENTS_LIMIT),
            "tags": load_tags(conn, shelter_id),
            "revert_window_minutes": config.STAFF_REVERT_WINDOW_MINUTES,
        }


@bp.post("/api/staff/<shelter_id>/count")
@require_staff
def set_count(shelter_id):
    count = _int((request.get_json(silent=True) or {}).get("open_beds"))
    if count is None or not _within_capacity(_shelter_row(shelter_id), count):
        return {"error": "invalid_count"}, 400
    return _staff_change(shelter_id, set_to=count)


@bp.post("/api/staff/<shelter_id>/adjust")
@require_staff
def adjust(shelter_id):
    delta = _int((request.get_json(silent=True) or {}).get("delta"))
    if delta not in (1, -1):
        return {"error": "invalid_delta"}, 400
    shelter = _shelter_row(shelter_id)
    if delta == 1 and not _within_capacity(shelter, shelter["open_beds"] + 1):
        return {"error": "at_capacity"}, 409
    return _staff_change(shelter_id, delta=delta)


@bp.post("/api/staff/<shelter_id>/full")
@require_staff
def mark_full(shelter_id):
    return _staff_change(shelter_id, set_to=0)


@bp.post("/api/staff/<shelter_id>/open")
@require_staff
def reopen(shelter_id):
    count = _int((request.get_json(silent=True) or {}).get("open_beds", 1))
    if count is None or count < 1 or not _within_capacity(_shelter_row(shelter_id), count):
        return {"error": "invalid_count"}, 400
    with transaction() as conn:
        conn.execute("UPDATE shelters SET accepting = TRUE WHERE id = %s", (shelter_id,))
        updated, applied, event_id = change_beds_logged(
            conn, shelter_id, source="staff", staff_update=True, set_to=count)
    emit_shelter_update(updated)
    return _applied(updated, applied, event_id)


@bp.post("/api/staff/<shelter_id>/events/<int:event_id>/revert")
@require_staff
def revert(shelter_id, event_id):
    """Reverse one tap/text/staff change from the last hour. Each change can be reverted once."""
    with transaction() as conn:
        event = conn.execute(
            "SELECT *, time > now() - %s::int * interval '1 minute' AS recent"
            " FROM availability_events WHERE id = %s AND shelter_id = %s FOR UPDATE",
            (config.STAFF_REVERT_WINDOW_MINUTES, event_id, shelter_id),
        ).fetchone()
        if event is None:
            return {"error": "event_not_found"}, 404
        if event["reverted_at"] is not None:
            return {"error": "already_reverted"}, 409
        if event["reverts_event_id"] is not None:
            return {"error": "cannot_revert_a_revert"}, 409
        if event["source"] not in REVERTABLE_SOURCES:
            return {"error": "not_revertable", "source": event["source"]}, 409
        if not event["recent"]:
            return {"error": "revert_window_passed"}, 409
        if event["delta"] == 0:
            return {"error": "nothing_to_revert"}, 409
        conn.execute("UPDATE availability_events SET reverted_at = now() WHERE id = %s", (event_id,))
        updated, applied, new_id = change_beds_logged(
            conn, shelter_id, source="staff", staff_update=True, delta=-event["delta"],
            reverts_event_id=event_id)
    emit_shelter_update(updated)
    return _applied(updated, applied, new_id, status="reverted", reverted_event_id=event_id)


def _normalize_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    return digits[1:] if len(digits) == 11 and digits.startswith("1") else digits


@bp.patch("/api/staff/<shelter_id>/settings")
@require_staff
def settings(shelter_id):
    body = request.get_json(silent=True) or {}
    shelter = _shelter_row(shelter_id)
    updates = {}
    for flag in ("pets_ok", "accepting"):
        if flag in body:
            if not isinstance(body[flag], bool):
                return {"error": f"invalid_{flag}"}, 400
            updates[flag] = body[flag]
    if "capacity" in body:
        capacity = _int(body["capacity"])
        if capacity is None or not 0 <= capacity <= MAX_BEDS:
            return {"error": "invalid_capacity"}, 400
        updates["capacity"] = capacity
    if "staff_phone" in body:
        phone = (body["staff_phone"] or "").strip()
        if phone and shelter["is_dv"]:
            return {"error": "not_allowed_for_dv"}, 400  # DV shelters never have a staff phone on file
        if phone and len(_normalize_phone(phone)) != 10:
            return {"error": "invalid_phone"}, 400
        if phone:
            with transaction() as conn:
                others = conn.execute(
                    "SELECT staff_phone FROM shelters WHERE id <> %s AND staff_phone IS NOT NULL", (shelter_id,)
                ).fetchall()
            if any(_normalize_phone(o["staff_phone"]) == _normalize_phone(phone) for o in others):
                return {"error": "phone_in_use"}, 409  # SMS updates match on a unique number
        updates["staff_phone"] = phone or None
    if not updates:
        return {"error": "no_settings"}, 400

    with transaction() as conn:
        sets = ", ".join(f"{col} = %({col})s" for col in updates)
        conn.execute(f"UPDATE shelters SET {sets} WHERE id = %(id)s", {**updates, "id": shelter_id})
        # Log it (delta 0) and refresh freshness: staff just confirmed tonight's details.
        updated, applied, event_id = change_beds_logged(conn, shelter_id, source="staff", staff_update=True)
    emit_shelter_update(updated)
    return _applied(updated, applied, event_id, status="saved")


@bp.post("/api/staff/<shelter_id>/tags/rotate")
@require_staff
def rotate_tags(shelter_id):
    """New secret(s) for a lost or copied tag. The old link stops working at once."""
    action = (request.get_json(silent=True) or {}).get("action")
    actions = TAG_ACTIONS if action == "all" else (action,) if action in TAG_ACTIONS else None
    if actions is None:
        return {"error": "invalid_action"}, 400
    with transaction() as conn:
        for a in actions:
            secret = "".join(secrets.choice(_SECRET_ALPHABET) for _ in range(16))
            conn.execute(
                "INSERT INTO tags (id, shelter_id, action, secret) VALUES (%s, %s, %s, %s)"
                " ON CONFLICT (shelter_id, action) DO UPDATE SET secret = EXCLUDED.secret, last_tap_at = NULL",
                (f"{shelter_id}-{a}", shelter_id, a, secret),
            )
        return {"status": "rotated", "rotated": list(actions), "tags": load_tags(conn, shelter_id)}


@bp.delete("/api/staff/<shelter_id>/holds/<hold_id>")
@require_staff
def release_hold(shelter_id, hold_id):
    """The person never arrived: release the hold and give the bed back."""
    try:
        uuid.UUID(hold_id)
    except ValueError:
        return {"error": "hold_not_found"}, 404
    with transaction() as conn:
        hold = conn.execute(
            "SELECT * FROM holds WHERE id = %s AND shelter_id = %s FOR UPDATE", (hold_id, shelter_id)
        ).fetchone()
        if hold is None:
            return {"error": "hold_not_found"}, 404
        if hold["status"] != "active":
            return {"error": "hold_not_active", "status": hold["status"]}, 409
        hold = conn.execute("UPDATE holds SET status = 'cancelled' WHERE id = %s RETURNING *", (hold_id,)).fetchone()
        updated, applied, event_id = change_beds_logged(
            conn, shelter_id, source="staff", staff_update=True, delta=1, hold_id=hold_id)
    emit_shelter_update(updated)
    return _applied(updated, applied, event_id, status="released", hold=serialize_hold(hold))
