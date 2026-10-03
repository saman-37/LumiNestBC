"""Import shelters from a CSV into the database (insert or update by id).

    python scripts/import_shelters.py                         # data/shelters_template.csv
    python scripts/import_shelters.py data/real.csv --schema  # apply schema.sql first (new DB)

Columns: see data/shelters_template.csv. DV rows are always stored without address or
coordinates, even if the CSV has them.
"""
import argparse
import csv

from _common import ROOT, connect

BOOL_COLS = ("is_full", "women_only", "youth", "families", "pets_ok", "accessible", "couples", "is_dv")


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
    if row["is_dv"]:
        if row["address"] or row["lat"] or row["lng"]:
            print(f"  ! {row['id']}: DV shelter had a location in the CSV; dropping it")
        row.update(address=None, lat=None, lng=None)
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="?", default=str(ROOT / "data" / "shelters_template.csv"))
    parser.add_argument("--schema", action="store_true", help="apply backend/sql/schema.sql first")
    args = parser.parse_args()

    with open(args.csv, newline="") as f:
        rows = [to_row(r) for r in csv.DictReader(f)]

    with connect() as conn:
        if args.schema:
            conn.execute((ROOT / "backend" / "sql" / "schema.sql").read_text())
            print("schema applied")
        for row in rows:
            conn.execute(
                """
                INSERT INTO shelters (id, name, address, lat, lng, capacity, open_beds, is_full,
                    women_only, youth, families, pets_ok, accessible, couples, is_dv, dv_phone,
                    staff_phone, last_updated_at)
                VALUES (%(id)s, %(name)s, %(address)s, %(lat)s, %(lng)s, %(capacity)s, %(open_beds)s,
                    %(is_full)s, %(women_only)s, %(youth)s, %(families)s, %(pets_ok)s, %(accessible)s,
                    %(couples)s, %(is_dv)s, %(dv_phone)s, %(staff_phone)s,
                    COALESCE(%(last_updated_at)s::timestamptz, now()))
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, address = EXCLUDED.address, lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng, capacity = EXCLUDED.capacity, open_beds = EXCLUDED.open_beds,
                    is_full = EXCLUDED.is_full, women_only = EXCLUDED.women_only, youth = EXCLUDED.youth,
                    families = EXCLUDED.families, pets_ok = EXCLUDED.pets_ok,
                    accessible = EXCLUDED.accessible, couples = EXCLUDED.couples, is_dv = EXCLUDED.is_dv,
                    dv_phone = EXCLUDED.dv_phone, staff_phone = EXCLUDED.staff_phone,
                    last_updated_at = EXCLUDED.last_updated_at
                """,
                row,
            )
            print(f"  {row['id']}: {row['name']} ({row['open_beds']} open)")
    print(f"imported {len(rows)} shelter(s). Next: python scripts/generate_tag_links.py")


if __name__ == "__main__":
    main()
