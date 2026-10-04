"""Shared bed-count logic used by tags, holds and jobs. Owner: Backend (Person 2).

Every change to shelters.open_beds goes through change_beds() so that it is always
row-locked, never negative, and always logged to availability_events.
"""
from datetime import datetime, timezone

from . import config

_PUBLIC_FIELDS = (
    "id", "name", "address", "lat", "lng", "capacity", "open_beds", "is_full",
    "women_only", "youth", "families", "pets_ok", "accessible", "couples",
    "is_dv", "dv_phone", "staff_phone", "public_phone", "accepting", "last_update_source",
)


class ShelterNotFound(LookupError):
    pass


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def minutes_since(dt: datetime, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    return max(0, int((now - dt).total_seconds() // 60))


def freshness_for(minutes: int) -> str:
    if minutes < config.FRESH_GREEN_MAX_MINUTES:
        return "green"
    if minutes <= config.FRESH_AMBER_MAX_MINUTES:
        return "amber"
    return "red"


def public_shelter(row: dict, now: datetime | None = None) -> dict:
    """The ONLY shape a shelter may leave the server in (API responses and socket events).

    DV shelters never expose address or coordinates, whatever is stored in the row.
    """
    minutes = minutes_since(row["last_updated_at"], now)
    data = {field: row[field] for field in _PUBLIC_FIELDS}
    data["last_updated_at"] = iso(row["last_updated_at"])
    data["minutes_since_update"] = minutes
    data["freshness"] = freshness_for(minutes)
    if row["is_dv"]:
        data.update(address=None, lat=None, lng=None, staff_phone=None, public_phone=None)
    else:
        data["dv_phone"] = None
    return data


def serialize_hold(row: dict) -> dict:
    remaining = (row["expires_at"] - datetime.now(timezone.utc)).total_seconds()
    return {
        "id": str(row["id"]),
        "shelter_id": row["shelter_id"],
        "worker_name": row["worker_name"],
        "worker_org": row["worker_org"],
        "created_at": iso(row["created_at"]),
        "expires_at": iso(row["expires_at"]),
        "status": row["status"],
        "minutes_left": max(0, int(remaining // 60)) if row["status"] == "active" else 0,
    }


def lock_shelter(conn, shelter_id: str) -> dict | None:
    return conn.execute("SELECT * FROM shelters WHERE id = %s FOR UPDATE", (shelter_id,)).fetchone()


def change_beds(conn, shelter_id: str, *, source: str, delta: int = 0, set_to: int | None = None,
                staff_update: bool = False, hold_id=None) -> tuple[dict, int]:
    """Apply a bed change inside the caller's transaction.

    staff_update=True refreshes last_updated_at (freshness reflects staff confirmations,
    not holds or expiries). Returns (updated shelter row, delta actually applied).
    """
    updated, applied, _ = change_beds_logged(conn, shelter_id, source=source, delta=delta,
                                             set_to=set_to, staff_update=staff_update, hold_id=hold_id)
    return updated, applied


def change_beds_logged(conn, shelter_id: str, *, source: str, delta: int = 0, set_to: int | None = None,
                       staff_update: bool = False, reverts_event_id: int | None = None,
                       hold_id=None) -> tuple[dict, int, int]:
    """change_beds(), also returning the availability_events id it logged. hold_id links a
    hold / arrival / expiry / release event to its hold (so staff see whose bed it was)."""
    row = lock_shelter(conn, shelter_id)
    if row is None:
        raise ShelterNotFound(shelter_id)
    new_count = set_to if set_to is not None else max(0, row["open_beds"] + delta)
    applied = new_count - row["open_beds"]
    updated = conn.execute(
        """
        UPDATE shelters
           SET open_beds = %(n)s,
               is_full = %(full)s,
               last_update_source = %(source)s,
               last_updated_at = CASE WHEN %(staff)s THEN now() ELSE last_updated_at END
         WHERE id = %(id)s
     RETURNING *
        """,
        {"n": new_count, "full": new_count == 0, "staff": staff_update, "id": shelter_id, "source": source},
    ).fetchone()
    event = conn.execute(
        "INSERT INTO availability_events (time, shelter_id, delta, open_beds_after, source, reverts_event_id, hold_id)"
        " VALUES (now(), %s, %s, %s, %s, %s, %s) RETURNING id",
        (shelter_id, applied, new_count, source, reverts_event_id, hold_id),
    ).fetchone()
    return updated, applied, event["id"]


def mark_arrived(conn, hold_id) -> tuple[dict, dict]:
    """Confirm an arrival. The bed was already taken when the hold was made, so delta is 0."""
    hold = conn.execute(
        "UPDATE holds SET status = 'arrived' WHERE id = %s RETURNING *", (hold_id,)
    ).fetchone()
    shelter, _ = change_beds(conn, hold["shelter_id"], source="arrival", staff_update=True, hold_id=hold_id)
    return hold, shelter
