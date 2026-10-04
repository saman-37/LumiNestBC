"""Import shelters from a CSV into the database (insert or update by id).

    python scripts/import_shelters.py                         # data/shelters.csv (else the template)
    python scripts/import_shelters.py data/real.csv --schema  # apply schema.sql first (new DB)
    python scripts/import_shelters.py data/real.csv --geocode # fill blank lat/lng from address

Columns: see data/shelters_template.csv (public_phone is optional: the front-desk number on
the Call button, display only). DV rows are always stored without address,
coordinates or staff phone, even if the CSV has them.

--geocode looks up blank lat/lng on OpenStreetMap Nominatim (1 request per second) and
writes the results back into the CSV. DV rows are never geocoded.

Real shelters have no staff_phone in the CSV, so they can never get texts from us. If
DEMO_STAFF_PHONE is set in .env, it becomes the staff_phone of the demo shelters below
(in the database only; it's never written to the CSV).
"""
import argparse
import csv
import json
import os
import time
import urllib.parse
import urllib.request

from _common import ROOT, connect

from app.comms.http import ssl_context

BOOL_COLS = ("is_full", "women_only", "youth", "families", "pets_ok", "accessible", "couples", "is_dv")
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "LuminestBC-shelter-import/1.0 (StormHacks 2026 shelter-bed map; scripts/import_shelters.py)"
DEMO_SHELTER_IDS = ("shelter-01", "shelter-20")  # Tap Board shelter, fictional Surrey women's shelter


def parse_bool(value: str) -> bool:
    return (value or "").strip().lower() in ("1", "true", "yes", "y")


def blank_to_none(value: str | None):
    value = (value or "").strip()
    return value or None


def to_row(raw: dict) -> dict:
    row = {k: blank_to_none(v) for k, v in raw.items()}
    for col in BOOL_COLS:
        row[col] = parse_bool(raw.get(col, ""))
    row["lat"] = float(row["lat"]) if row["lat"] else None
    row["lng"] = float(row["lng"]) if row["lng"] else None
    row["capacity"] = int(row["capacity"] or 0)
    row["open_beds"] = 0 if row["is_full"] else int(row["open_beds"] or 0)
    row["is_full"] = row["open_beds"] == 0
    row.setdefault("public_phone", None)  # older CSVs have no public_phone column
    if row["is_dv"]:
        if row["address"] or row["lat"] or row["lng"]:
            print(f"  ! {row['id']}: DV shelter had a location in the CSV; dropping it")
        if row["staff_phone"]:
            print(f"  ! {row['id']}: DV shelter had a staff phone in the CSV; dropping it")
        row.update(address=None, lat=None, lng=None, staff_phone=None, public_phone=None)
    return row


def geocode(address: str) -> tuple[float, float] | None:
    query = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1, "countrycodes": "ca"})
    request = urllib.request.Request(f"{NOMINATIM_URL}?{query}", headers={"User-Agent": USER_AGENT})
    # certifi's CA bundle: python.org macOS builds ship without system certificates.
    with urllib.request.urlopen(request, timeout=15, context=ssl_context()) as response:
        results = json.load(response)
    return (float(results[0]["lat"]), float(results[0]["lon"])) if results else None


def fill_coordinates(raw_rows: list[dict]) -> list[str]:
    """Fill blank lat/lng in place. Returns the ids that could not be geocoded."""
    failed, last_request = [], 0.0
    for raw in raw_rows:
        if parse_bool(raw.get("is_dv", "")) or (blank_to_none(raw["lat"]) and blank_to_none(raw["lng"])):
            continue
        address = blank_to_none(raw["address"])
        if not address:
            failed.append(f"{raw['id']} (no address)")
            continue
        time.sleep(max(0.0, 1.0 - (time.monotonic() - last_request)))
        last_request = time.monotonic()
        try:
            found = geocode(address)
        except OSError as e:
            failed.append(f"{raw['id']} ({address}: {e})")
            continue
        if found is None:
            failed.append(f"{raw['id']} ({address}: no match)")
            continue
        raw["lat"], raw["lng"] = f"{found[0]:.6f}", f"{found[1]:.6f}"
        print(f"  geocoded {raw['id']}: {raw['lat']}, {raw['lng']}")
    return failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="?", help="default: data/shelters.csv, else data/shelters_template.csv")
    parser.add_argument("--schema", action="store_true", help="apply backend/sql/schema.sql first")
    parser.add_argument("--geocode", action="store_true",
                        help="fill blank lat/lng from address via Nominatim and save them to the CSV")
    args = parser.parse_args()
    if args.csv is None:
        real = ROOT / "data" / "shelters.csv"
        args.csv = str(real if real.exists() else ROOT / "data" / "shelters_template.csv")
    print(f"importing {args.csv}")

    with open(args.csv, newline="") as f:
        reader = csv.DictReader(f)
        raw_rows = list(reader)

    failed = []
    if args.geocode:
        failed = fill_coordinates(raw_rows)
        with open(args.csv, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=reader.fieldnames)
            writer.writeheader()
            writer.writerows(raw_rows)
        print(f"coordinates saved to {args.csv}")

    rows = [to_row(r) for r in raw_rows]
    demo_phone = blank_to_none(os.getenv("DEMO_STAFF_PHONE"))
    if demo_phone:
        for row in rows:
            if row["id"] in DEMO_SHELTER_IDS and not row["is_dv"]:
                row["staff_phone"] = demo_phone
        print(f"DEMO_STAFF_PHONE set as staff phone for {', '.join(DEMO_SHELTER_IDS)}")

    with connect() as conn:
        if args.schema:
            conn.execute((ROOT / "backend" / "sql" / "schema.sql").read_text())
            print("schema applied")
        for row in rows:
            conn.execute(
                """
                INSERT INTO shelters (id, name, address, lat, lng, capacity, open_beds, is_full,
                    women_only, youth, families, pets_ok, accessible, couples, is_dv, dv_phone,
                    staff_phone, public_phone, last_updated_at)
                VALUES (%(id)s, %(name)s, %(address)s, %(lat)s, %(lng)s, %(capacity)s, %(open_beds)s,
                    %(is_full)s, %(women_only)s, %(youth)s, %(families)s, %(pets_ok)s, %(accessible)s,
                    %(couples)s, %(is_dv)s, %(dv_phone)s, %(staff_phone)s, %(public_phone)s,
                    COALESCE(%(last_updated_at)s::timestamptz, now()))
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, address = EXCLUDED.address, lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng, capacity = EXCLUDED.capacity, open_beds = EXCLUDED.open_beds,
                    is_full = EXCLUDED.is_full, women_only = EXCLUDED.women_only, youth = EXCLUDED.youth,
                    families = EXCLUDED.families, pets_ok = EXCLUDED.pets_ok,
                    accessible = EXCLUDED.accessible, couples = EXCLUDED.couples, is_dv = EXCLUDED.is_dv,
                    dv_phone = EXCLUDED.dv_phone, staff_phone = EXCLUDED.staff_phone,
                    public_phone = EXCLUDED.public_phone, last_updated_at = EXCLUDED.last_updated_at
                """,
                row,
            )
            print(f"  {row['id']}: {row['name']} ({row['open_beds']} open)")
    print(f"imported {len(rows)} shelter(s). Next: python scripts/generate_tag_links.py")
    if failed:
        print(f"\n{len(failed)} shelter(s) could not be geocoded (imported without a map pin):")
        for line in failed:
            print(f"  ! {line}")


if __name__ == "__main__":
    main()
