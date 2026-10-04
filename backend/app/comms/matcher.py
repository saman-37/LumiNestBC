"""Rank real shelter beds for a voice-line caller. Owner: Communications (Person 3).

Plain Python, no I/O except reading data/area_centres.json once. Input shelters must be
public_shelter() dicts, so DV shelters arrive with no coordinates and are never ranked by
address or location.

Hard filters: not full, open_beds >= 1, men never matched to women-only, and family /
pets / accessible / couples needs must be supported.
Score (lower is better): distance_km + min(minutes_since_update / 30, 10).
"""
import json
import math
from functools import lru_cache

from .. import config

AREA_CENTRES_PATH = config.REPO_ROOT / "data" / "area_centres.json"

# caller need -> shelter flag that must be true
_NEED_FLAGS = (
    ("family", "families"),
    ("has_pet", "pets_ok"),
    ("needs_accessible", "accessible"),
    ("is_couple", "couples"),
)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@lru_cache(maxsize=1)
def _area_index() -> list[tuple[str, str, float, float]]:
    """(lowercase name or alias, canonical area name, lat, lng)."""
    try:
        areas = json.loads(AREA_CENTRES_PATH.read_text())["areas"]
    except FileNotFoundError:
        return []
    index = []
    for area in areas:
        for name in [area["name"], *area.get("aliases", [])]:
            index.append((name.lower(), area["name"], area["lat"], area["lng"]))
    # Longest names first so "Surrey Whalley" wins over "Surrey".
    return sorted(index, key=lambda item: -len(item[0]))


def find_area(area_text: str | None) -> tuple[str, float, float] | None:
    """Map free text like "near Metrotown" to (area name, lat, lng) using data/area_centres.json."""
    if not area_text:
        return None
    text = area_text.lower()
    for key, name, lat, lng in _area_index():
        if key in text:
            return name, lat, lng
    return None


def resolve_area(area_text: str | None) -> tuple[float, float] | None:
    """Map free text like "near Metrotown" to (lat, lng)."""
    area = find_area(area_text)
    return (area[1], area[2]) if area else None


def passes_hard_filters(req: dict, shelter: dict) -> bool:
    if shelter["is_full"] or shelter["open_beds"] < 1:
        return False
    if req.get("gender") == "man" and shelter["women_only"]:
        return False
    # TODO(Communications): decide youth/age rules with shelter partners (e.g. adults at youth-only sites).
    return all(shelter[flag] for need, flag in _NEED_FLAGS if req.get(need))


def distance_km(shelter: dict, origin: tuple[float, float] | None) -> float | None:
    if origin is None or shelter["is_dv"] or shelter["lat"] is None or shelter["lng"] is None:
        return None
    return haversine_km(origin[0], origin[1], shelter["lat"], shelter["lng"])


def score(shelter: dict, origin: tuple[float, float] | None) -> float:
    dist = distance_km(shelter, origin)
    if dist is None:
        dist = config.MATCH_UNKNOWN_DISTANCE_KM if origin is not None else 0.0
    staleness = min(shelter["minutes_since_update"] / config.MATCH_FRESHNESS_DIVISOR,
                    config.MATCH_FRESHNESS_CAP)
    return dist + staleness


def rank_shelters(req: dict, shelters: list[dict], origin: tuple[float, float] | None = None,
                  top_n: int = config.MATCH_TOP_N) -> list[dict]:
    """Return up to top_n matches: [{"shelter", "score", "distance_km"}], best first.

    req follows the voice request schema in comms/gemini.py. If origin is None it is
    resolved from req["area_text"]; if that fails, ranking is by freshness only.
    """
    if origin is None:
        origin = resolve_area(req.get("area_text"))
    candidates = [s for s in shelters if passes_hard_filters(req, s)]
    ranked = sorted(candidates, key=lambda s: score(s, origin))
    return [
        {"shelter": s, "score": round(score(s, origin), 2), "distance_km": distance_km(s, origin)}
        for s in ranked[:top_n]
    ]
