"""Merge public front-desk numbers into data/shelters.csv (and optionally the database).

    python scripts/import_public_phones.py              # update data/shelters.csv only
    python scripts/import_public_phones.py --db         # ...and set shelters.public_phone in the DB

Reads data/shelter_public_phones.csv (id, name, public_phone). Rows are matched by id, then the
name is compared; a mismatch is printed and that phone is skipped, so a renumbered shelter never
gets someone else's number. DV shelters never get a public phone (they use dv_phone).

public_phone is display only (the Call button). Staff SMS updates match on staff_phone only.
"""
import argparse
import csv
import re

from _common import ROOT, connect

PHONES = ROOT / "data" / "shelter_public_phones.csv"
SHELTERS = ROOT / "data" / "shelters.csv"


def norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()


def load_phones() -> dict[str, dict]:
    with open(PHONES, newline="") as f:
        return {row["id"].strip(): row for row in csv.DictReader(f) if row.get("id")}


def merge(rows: list[dict], phones: dict[str, dict]) -> tuple[int, list[str]]:
    """Set row["public_phone"] in place. Returns (numbers set, problems)."""
    problems, matched = [], 0
    ids = {r["id"] for r in rows}
    for row in rows:
        row.setdefault("public_phone", "")
        entry = phones.get(row["id"])
        if entry is None:
            continue
        if (row.get("is_dv") or "").strip().lower() in ("1", "true", "yes", "y"):
            problems.append(f"{row['id']}: DV shelter, public phone ignored")
            row["public_phone"] = ""
            continue
        if norm_name(entry["name"]) != norm_name(row["name"]):
            problems.append(f"{row['id']}: name mismatch, skipped (phones: {entry['name']!r}, shelters: {row['name']!r})")
            continue
        row["public_phone"] = entry["public_phone"].strip()
        matched += 1
    problems += [f"{pid}: in the phone list but not in shelters.csv" for pid in phones if pid not in ids]
    return matched, problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--db", action="store_true", help="also set public_phone in the database")
    args = parser.parse_args()

    with open(SHELTERS, newline="") as f:
        reader = csv.DictReader(f)
        fields = list(reader.fieldnames or [])
        rows = list(reader)
    if "public_phone" not in fields:
        fields.insert(fields.index("staff_phone") + 1 if "staff_phone" in fields else len(fields), "public_phone")

    matched, problems = merge(rows, load_phones())
    with open(SHELTERS, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"{matched} public phone(s) written to {SHELTERS.relative_to(ROOT)}")

    if args.db:
        with connect() as conn:
            for row in rows:
                conn.execute("UPDATE shelters SET public_phone = %s WHERE id = %s AND NOT is_dv",
                             (row["public_phone"] or None, row["id"]))
        print(f"public_phone updated in the database for {len(rows)} shelter(s)")

    for problem in problems:
        print(f"  ! {problem}")


if __name__ == "__main__":
    main()
