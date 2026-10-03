from app.comms.matcher import rank_shelters, resolve_area


def shelter(id, lat=49.28, lng=-123.1, **fields):
    base = {"id": id, "lat": lat, "lng": lng, "open_beds": 2, "is_full": False,
            "women_only": False, "youth": False, "families": False, "pets_ok": False,
            "accessible": False, "couples": False, "is_dv": False, "minutes_since_update": 5}
    return {**base, **fields}


def test_men_never_matched_to_women_only():
    shelters = [shelter("w", women_only=True), shelter("g", lat=49.2, lng=-122.9)]
    ids = [m["shelter"]["id"] for m in rank_shelters({"gender": "man"}, shelters, origin=(49.28, -123.1))]
    assert ids == ["g"]


def test_needs_must_match_and_full_excluded():
    shelters = [shelter("nopets"), shelter("pets", pets_ok=True), shelter("full", pets_ok=True, open_beds=0)]
    ids = [m["shelter"]["id"] for m in rank_shelters({"has_pet": True}, shelters)]
    assert ids == ["pets"]


def test_ranks_by_distance_plus_staleness_top_two():
    origin = resolve_area("near Metrotown")
    assert origin is not None
    shelters = [
        shelter("near-stale", lat=origin[0], lng=origin[1], minutes_since_update=600),  # +10 cap
        shelter("near-fresh", lat=origin[0] + 0.01, lng=origin[1]),                     # ~1.1 km
        shelter("far", lat=49.19, lng=-122.85),                                         # Surrey
    ]
    ids = [m["shelter"]["id"] for m in rank_shelters({}, shelters, origin=origin)]
    assert ids == ["near-fresh", "near-stale"]


def test_dv_ranked_without_location():
    dv = shelter("dv", lat=None, lng=None, is_dv=True)
    [match] = rank_shelters({}, [dv], origin=(49.28, -123.1))
    assert match["distance_km"] is None
