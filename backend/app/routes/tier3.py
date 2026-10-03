"""Tier 3 placeholders. Owner: Design/data (Person 4) with Backend (Person 2).

Scope rule: nothing here gets built until Tier 1 works on two devices.
"""
from flask import Blueprint

bp = Blueprint("tier3", __name__)

NOT_IMPLEMENTED = {"error": "not_implemented", "tier": 3}


@bp.get("/api/stats")
@bp.get("/api/stats/<path:what>")
def stats(what: str = ""):
    # TODO(Person 4): bed-availability trends from the availability_events hypertable
    # (e.g. time_bucket('1 hour', time)) for the pitch dashboard.
    return NOT_IMPLEMENTED, 501


@bp.get("/api/weather-layer")
def weather_layer():
    # TODO(Person 4): cold/heat/rain overlay for the map (see satellite/).
    return NOT_IMPLEMENTED, 501
