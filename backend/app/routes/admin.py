"""Admin / test hub and simulators. Owner: Backend (Person 2), voice/SMS with Communications.

Only exists while DEV_TOOLS_ENABLED=true (404 otherwise) and needs X-Admin-Key = ADMIN_KEY.
Lets the team test every flow from one laptop, and is the backup if NFC or the phone line
fails during judging. Transcripts and SMS bodies are never stored or logged.
"""
from functools import wraps
from time import perf_counter

from flask import Blueprint, request

from .. import config
from ..auth import admin_key_valid, limiter
from ..availability import public_shelter
from ..comms import twilio_routes
from ..comms.voice import audio_id_for, say
from ..db import transaction
from ..demo import reset_demo
from ..jobs import expire_holds
from ..sockets import emit_shelter_update
from .staff import load_tags

bp = Blueprint("admin", __name__)

MAX_TRANSCRIPT_LEN = 500


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not config.DEV_TOOLS_ENABLED:
            return {"error": "not_found"}, 404
        if not limiter.allow("admin", config.STAFF_RATE_LIMIT_PER_MINUTE):
            return {"error": "rate_limited"}, 429
        if not config.ADMIN_KEY:
            return {"error": "admin_key_not_set"}, 403
        if not admin_key_valid(request.headers.get("X-Admin-Key", "")):
            return {"error": "invalid_admin_key"}, 403
        return fn(*args, **kwargs)
    return wrapper


def _emit_all(conn) -> None:
    for row in conn.execute("SELECT * FROM shelters").fetchall():
        emit_shelter_update(row)


@bp.get("/api/admin/shelters")
@require_admin
def shelters():
    with transaction() as conn:
        rows = conn.execute(
            "SELECT s.*, k.shelter_id IS NOT NULL AS has_staff_key FROM shelters s"
            " LEFT JOIN staff_keys k ON k.shelter_id = s.id ORDER BY s.name"
        ).fetchall()
        return {"shelters": [
            {**public_shelter(r), "has_staff_key": r["has_staff_key"], "tags": load_tags(conn, r["id"])}
            for r in rows
        ]}


@bp.post("/api/admin/reset-demo")
@require_admin
def reset():
    with transaction() as conn:
        summary = reset_demo(conn)
    with transaction() as conn:
        _emit_all(conn)
    return {"status": "reset", **summary}


@bp.post("/api/admin/expire-holds")
@require_admin
def expire_all_holds():
    with transaction() as conn:
        conn.execute("UPDATE holds SET expires_at = now() WHERE status = 'active'")
    return {"status": "expired", "expired": expire_holds()}


@bp.post("/api/admin/shelters/<shelter_id>/stale")
@require_admin
def make_stale(shelter_id):
    """Pretend staff last confirmed 4 hours ago (tests freshness badges and the stale nudge)."""
    with transaction() as conn:
        row = conn.execute(
            "UPDATE shelters SET last_updated_at = now() - interval '4 hours' WHERE id = %s RETURNING *",
            (shelter_id,),
        ).fetchone()
    if row is None:
        return {"error": "shelter_not_found"}, 404
    emit_shelter_update(row)
    return {"status": "stale", "shelter": public_shelter(row)}


def _spoken(kind: str, text: str) -> dict:
    audio_id = audio_id_for(text, fixed=kind in ("greeting", "filler"))
    return {"kind": kind, "text": text, "audio_url": twilio_routes.audio_path(audio_id) if audio_id else None}


@bp.post("/api/dev/voice")
@require_admin
def voice():
    """Run the real call pipeline on a typed or spoken transcript, without a phone."""
    transcript = str((request.get_json(silent=True) or {}).get("transcript") or "").strip()
    if not transcript or len(transcript) > MAX_TRANSCRIPT_LEN:
        return {"error": "invalid_transcript"}, 400
    started = perf_counter()
    result = twilio_routes.answer(transcript)
    tts_started = perf_counter()
    lines = [_spoken("greeting", say("greeting")), _spoken("filler", say("filler"))]
    lines += [_spoken("answer", line) for line in result["lines"]]
    finished = perf_counter()
    return {
        "request": result["request"],
        "area": result["area"],
        "matches": [
            {"id": m["shelter"]["id"], "name": m["shelter"]["name"], "open_beds": m["shelter"]["open_beds"],
             "is_dv": m["shelter"]["is_dv"], "score": m["score"], "distance_km": m["distance_km"]}
            for m in result["matches"]
        ],
        "lines": lines,
        "voice": "elevenlabs" if all(line["audio_url"] for line in lines) else "twilio_say",
        "extractor": "gemini" if config.GEMINI_API_KEY else "keywords",
        "timings_ms": {**result["timings_ms"],
                       "tts": round((finished - tts_started) * 1000),
                       "total": round((finished - started) * 1000)},
    }


@bp.post("/api/dev/sms")
@require_admin
def sms():
    """Run the staff SMS handler without Twilio (no signature check)."""
    body = request.get_json(silent=True) or {}
    sender, text = str(body.get("from") or ""), str(body.get("body") or "")
    if not sender or not text:
        return {"error": "missing_fields", "required": ["from", "body"]}, 400
    result = twilio_routes.handle_staff_sms(sender, text)
    shelter = result["shelter"]
    return {"reply": result["reply"], "changed": shelter is not None, "delta": result["delta"],
            "shelter": public_shelter(shelter) if shelter else None}
