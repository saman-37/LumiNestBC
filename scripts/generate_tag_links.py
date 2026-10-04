"""Create every shelter's 4 NFC tags and private staff-portal key, and export the links.

    python scripts/generate_tag_links.py                                  # https://luminestbc.tech
    python scripts/generate_tag_links.py --base-url http://localhost:5173 # local testing
    python scripts/generate_tag_links.py --rotate                         # new secrets for all tags
    python scripts/generate_tag_links.py --rotate-staff-keys              # new staff links for all
    python scripts/generate_tag_links.py --base-url https://luminestbc.tech --shelter shelter-01
                                                                          # just the demo shelter

Writes data/tag_links.csv with one row per shelter: the staff portal link plus the four tag
links. It contains secrets and is git-ignored. Don't commit it.

Tags keep their secret (so already-written NFC tags keep working) unless --rotate.
Staff keys are stored only as a hash, so a staff link can only be printed when the key is
created: shelters without a key get one; existing keys are kept (their link column says so)
unless --rotate-staff-keys.

URL formats:
  tag:          <base>/t/<shelter_id>/<action>?k=<secret>
  staff portal: <base>/staff/<shelter_id>#key=<key>   (the #fragment never reaches server logs)
"""
import argparse
import csv
import os
import secrets
import string

from _common import ROOT, TAG_ACTIONS, connect

from app.auth import set_staff_key

ALPHABET = string.ascii_letters + string.digits
KEPT = "(existing key kept; use --rotate-staff-keys for a new link)"


def new_secret() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(16))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=os.getenv("TAG_BASE_URL", "https://luminestbc.tech"))
    parser.add_argument("--out", help="default: data/tag_links.csv (with --shelter: data/tag_links_<ids>.csv,"
                                      " so the full sheet isn't overwritten). Git-ignored either way")
    parser.add_argument("--rotate", action="store_true", help="replace every existing tag secret")
    parser.add_argument("--rotate-staff-keys", action="store_true", help="replace every staff-portal key")
    parser.add_argument("--shelter", action="append", metavar="ID",
                        help="only this shelter (repeat for several), e.g. --shelter shelter-01")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    if args.out is None:
        name = "tag_links.csv" if not args.shelter else f"tag_links_{'_'.join(args.shelter)}.csv"
        args.out = str(ROOT / "data" / name)
    if not base.startswith(("http://", "https://")):
        parser.error(f"--base-url must start with http:// or https:// (got {base!r})")

    rows = []
    with connect() as conn:
        shelters = conn.execute(
            "SELECT s.id, s.name, k.shelter_id IS NOT NULL AS has_key"
            " FROM shelters s LEFT JOIN staff_keys k ON k.shelter_id = s.id"
            " WHERE %(ids)s::text[] IS NULL OR s.id = ANY(%(ids)s::text[]) ORDER BY s.id",
            {"ids": args.shelter},
        ).fetchall()
        if args.shelter and len(shelters) != len(set(args.shelter)):
            found = {s["id"] for s in shelters}
            raise SystemExit(f"unknown shelter id(s): {', '.join(sorted(set(args.shelter) - found))}")
        for shelter in shelters:
            row = {"shelter_id": shelter["id"], "shelter_name": shelter["name"]}
            if shelter["has_key"] and not args.rotate_staff_keys:
                row["staff_portal_url"] = KEPT
            else:
                row["staff_portal_url"] = f"{base}/staff/{shelter['id']}#key={set_staff_key(conn, shelter['id'])}"
            for action in TAG_ACTIONS:
                tag_id = f"{shelter['id']}-{action}"
                existing = conn.execute("SELECT secret FROM tags WHERE id = %s", (tag_id,)).fetchone()
                secret = existing["secret"] if existing and not args.rotate else new_secret()
                conn.execute(
                    "INSERT INTO tags (id, shelter_id, action, secret) VALUES (%s, %s, %s, %s)"
                    " ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret",
                    (tag_id, shelter["id"], action, secret),
                )
                row[f"{action}_url"] = f"{base}/t/{shelter['id']}/{action}?k={secret}"
            rows.append(row)

    fields = ["shelter_id", "shelter_name", "staff_portal_url"] + [f"{a}_url" for a in TAG_ACTIONS]
    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    for row in rows:
        print(f"{row['shelter_id']:<14} staff portal: {row['staff_portal_url']}")
        if args.shelter:  # a handful of shelters: print the tag links too
            for action in TAG_ACTIONS:
                print(f"{'':<14} {action:<7} {row[f'{action}_url']}")
    new_keys = sum(not r["staff_portal_url"].startswith("(") for r in rows)
    print(f"\n{len(rows)} shelter(s), {new_keys} new staff link(s), {len(rows) * 4} tag link(s) -> {args.out}")


if __name__ == "__main__":
    main()
