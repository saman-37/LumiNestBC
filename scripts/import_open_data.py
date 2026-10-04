"""Import the City of Vancouver "Homeless shelter locations" open data into the database.

    python scripts/import_open_data.py ~/Downloads/homeless-shelter-locations.csv
    python scripts/import_open_data.py ~/Downloads/homeless-shelter-locations.geojson --dry-run

Download the file yourself from https://opendata.vancouver.ca (dataset "Homeless shelter
locations", Open Government Licence - Vancouver) as CSV, GeoJSON or JSON. We do not scrape
bc.211.ca: its terms prohibit automated copying and reuse of its listings.

- Columns are inspected at runtime; whatever exists is mapped onto our shelters columns and a
  summary of mapped and skipped columns is printed.
- Rows are matched on name + address, so running it twice doesn't duplicate. When the file has
  no address (the city's doesn't), a same-name shelter from another source counts as a match.
  Imported rows get source = 'vancouver_open_data'; other sources are never overwritten.
- Anything that looks like a domestic-violence / transition house record is skipped entirely,
  so a DV address is never imported.
- New shelters start with 0 open beds and an old last_updated_at, so they show as
  "unconfirmed" until staff update them (or scripts/reset_demo.py sets demo counts).
- Phone numbers are NOT imported: staff_phone is what staff SMS updates match on, and real
  shelters must never receive texts from us. Staff can add their own number in the portal.
"""
import argparse
import ast
import csv
import json
import re
from pathlib import Path

from _common import connect

SOURCE = "vancouver_open_data"
UNCONFIRMED_DAYS = 7

# Our column -> header names we recognise (compared after normalising: lower case, a-z0-9_).
CANDIDATES = {
    "name": ("facility", "facility_name", "name", "shelter_name", "shelter"),
    "address": ("address", "street_address", "location_address", "full_address"),
    "phone": ("phone", "phone_number", "telephone", "contact_phone"),
    "category": ("category", "type", "population", "clients", "serves"),
    "pets": ("pets", "pets_allowed", "pets_ok"),
    "lat": ("latitude", "lat", "y"),
    "lng": ("longitude", "lng", "lon", "long", "x"),
    "point": ("geo_point_2d", "geo_point", "point", "coordinates"),
    "geom": ("geom", "geometry", "the_geom", "geo_shape"),
}
DV_PATTERN = re.compile(
    r"transition house|domestic|violence|\bdv\b|safe ?house|abuse|second stage|fleeing", re.I)
YES = {"yes", "y", "true", "1", "allowed", "ok"}


def norm(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", header.strip().lower()).strip("_")


def load_records(path: Path) -> list[dict]:
    """CSV (comma or semicolon), GeoJSON FeatureCollection, or a JSON list of records."""
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() in (".json", ".geojson"):
        data = json.loads(text)
        if isinstance(data, dict) and data.get("type") == "FeatureCollection":
            return [{**(f.get("properties") or {}), "geometry": f.get("geometry")} for f in data["features"]]
        if isinstance(data, dict) and "results" in data:  # Opendatasoft API response
            data = data["results"]
        return list(data)
    dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    return list(csv.DictReader(text.splitlines(), dialect=dialect))


def map_columns(headers: list[str]) -> tuple[dict, list[str]]:
    by_norm = {norm(h): h for h in headers}
    mapping = {}
    for ours, names in CANDIDATES.items():
        found = next((by_norm[n] for n in names if n in by_norm), None)
        if found:
            mapping[ours] = found
    used = set(mapping.values())
    return mapping, [h for h in headers if h not in used]


def _parse(value):
    """Values may arrive as dicts, JSON text or Python-repr text ("{'lon': ..}")."""
    if isinstance(value, (dict, list)) or value in (None, ""):
        return value
    for loader in (json.loads, ast.literal_eval):
        try:
            return loader(value)
        except (ValueError, SyntaxError, TypeError):
            continue
    return value


def coordinates(record: dict, mapping: dict) -> tuple[float, float] | None:
    try:
        if "lat" in mapping and "lng" in mapping and record.get(mapping["lat"]) not in (None, ""):
            return float(record[mapping["lat"]]), float(record[mapping["lng"]])
        if "point" in mapping:
            point = _parse(record.get(mapping["point"]))
            if isinstance(point, dict) and "lat" in point:
                return float(point["lat"]), float(point.get("lon", point.get("lng")))
            if isinstance(point, str) and "," in point:  # "49.26, -123.10"
                lat, lng = point.split(",")[:2]
                return float(lat), float(lng)
            if isinstance(point, (list, tuple)) and len(point) == 2:
                return float(point[0]), float(point[1])
        geom = _parse(record.get(mapping["geom"])) if "geom" in mapping else record.get("geometry")
        if isinstance(geom, dict):
            geom = geom.get("geometry", geom)
            if geom.get("type") == "Point":
                lng, lat = geom["coordinates"][:2]
                return float(lat), float(lng)
    except (TypeError, ValueError, KeyError):
        pass
    return None


def to_row(record: dict, mapping: dict) -> dict | None:
    get = lambda key: str(record.get(mapping[key]) or "").strip() if key in mapping else ""  # noqa: E731
    name = get("name")
    if not name:
        return None
    category = get("category").lower()
    coords = coordinates(record, mapping)
    return {
        "name": name,
        "address": get("address") or None,
        "lat": coords[0] if coords else None,
        "lng": coords[1] if coords else None,
        "women_only": "women" in category and "men" not in category.replace("women", ""),
        "youth": "youth" in category or "young" in category,
        "families": "famil" in category,
        "couples": "couple" in category,
        "pets_ok": get("pets").lower() in YES,
        "_category": category,
    }


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", type=Path, help="CSV, GeoJSON or JSON downloaded from opendata.vancouver.ca")
    parser.add_argument("--dry-run", action="store_true", help="show what would happen without writing")
    args = parser.parse_args()

    records = load_records(args.file)
    if not records:
        raise SystemExit("No records found in the file.")
    headers = list(records[0].keys())
    mapping, skipped = map_columns(headers)
    print(f"read {len(records)} record(s) from {args.file}")
    print("mapped columns:")
    for ours, theirs in mapping.items():
        if ours != "phone":
            print(f"  {theirs!r:<24} -> {ours}")
    print("skipped columns: " + (", ".join(repr(h) for h in skipped) if skipped else "(none)"))
    if "phone" in mapping:
        print(f"  note: {mapping['phone']!r} recognised but not imported (staff_phone is only for staff SMS)")
    if "name" not in mapping:
        raise SystemExit("Couldn't find a name/facility column; nothing imported.")

    counts = {"inserted": 0, "updated": 0, "skipped_dv": 0, "skipped_other_source": 0, "skipped_no_name": 0}
    with connect() as conn:
        for record in records:
            row = to_row(record, mapping)
            if row is None:
                counts["skipped_no_name"] += 1
                continue
            if DV_PATTERN.search(f"{row['name']} {row['_category']}"):
                counts["skipped_dv"] += 1  # never import a DV / transition house record or its address
                continue
            existing = conn.execute(
                "SELECT id, source FROM shelters WHERE lower(name) = lower(%s)"
                " AND coalesce(lower(address), '') = coalesce(lower(%s), '')",
                (row["name"], row["address"]),
            ).fetchone()
            if existing is None and row["address"] is None:
                # The city file has no street addresses; don't duplicate a curated shelter of the same name.
                existing = conn.execute(
                    "SELECT id, source FROM shelters WHERE lower(name) = lower(%s)"
                    " AND source IS DISTINCT FROM %s LIMIT 1", (row["name"], SOURCE),
                ).fetchone()
            if existing and existing["source"] != SOURCE:
                counts["skipped_other_source"] += 1
                print(f"  = {row['name']}: already in the database from another source; left as is")
                continue
            if args.dry_run:
                counts["updated" if existing else "inserted"] += 1
                print(f"  {'~' if existing else '+'} {row['name']}")
                continue
            fields = {k: v for k, v in row.items() if not k.startswith("_")}
            if existing:
                sets = ", ".join(f"{k} = %({k})s" for k in fields)
                conn.execute(f"UPDATE shelters SET {sets} WHERE id = %(id)s", {**fields, "id": existing["id"]})
                counts["updated"] += 1
                print(f"  ~ {existing['id']}: {row['name']}")
                continue
            base = shelter_id = f"van-{slug(row['name'])}"
            n = 2
            while conn.execute("SELECT 1 FROM shelters WHERE id = %s", (shelter_id,)).fetchone():
                shelter_id, n = f"{base}-{n}", n + 1
            cols = ", ".join(fields)
            vals = ", ".join(f"%({k})s" for k in fields)
            conn.execute(
                f"INSERT INTO shelters (id, source, open_beds, is_full, last_updated_at, {cols})"
                f" VALUES (%(id)s, %(source)s, 0, TRUE, now() - %(days)s::int * interval '1 day', {vals})",
                {**fields, "id": shelter_id, "source": SOURCE, "days": UNCONFIRMED_DAYS},
            )
            counts["inserted"] += 1
            print(f"  + {shelter_id}: {row['name']}")
        if args.dry_run:
            conn.rollback()

    print(("dry run: " if args.dry_run else "") + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in counts.items()))
    if counts["inserted"] and not args.dry_run:
        print("Next: python scripts/generate_tag_links.py  (tags + staff links for the new shelters)")


if __name__ == "__main__":
    main()
