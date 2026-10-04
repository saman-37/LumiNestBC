"""One-time production setup, run from a laptop against the production database.

    DATABASE_URL="$PROD_DATABASE_URL" python scripts/seed_production.py --yes

Steps (each one safe to repeat):
  1. apply backend/sql/schema.sql
  2. import data/shelters.csv (coordinates and public phones included)
  3. create tag secrets (existing ones are kept, so written NFC tags keep working) and new staff
     keys, and write every link to data/tag_links_production.csv (git-ignored: it holds secrets)
  4. put the shelters into the demo state (scripts/reset_demo.py)
  5. print a short summary

Refuses to run without --yes, and prints which database host it is about to change first.
New staff keys mean previously handed-out staff links stop working; pass --keep-staff-keys
to keep them (the CSV then can't show those staff links, only that they exist).
"""
import argparse
import os
import subprocess
import sys

from _common import ROOT, connect

from app.db import describe_url

DEFAULT_BASE_URL = "https://lumi-nest-bc.vercel.app"
OUT = ROOT / "data" / "tag_links_production.csv"


def run(script: str, *args: str) -> None:
    print(f"\n$ python scripts/{script} {' '.join(args)}")
    result = subprocess.run([sys.executable, str(ROOT / "scripts" / script), *args],
                            env=os.environ.copy(), capture_output=True, text=True)
    tail = result.stdout.strip().splitlines()[-3:]
    for line in tail:
        if "#key=" in line or "?k=" in line:
            continue  # never echo secrets; they're in the CSV
        print(f"  {line}")
    if result.returncode != 0:
        print(result.stderr.strip(), file=sys.stderr)
        raise SystemExit(f"{script} failed (exit {result.returncode}); nothing after it ran.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--yes", action="store_true", help="really change the database named by DATABASE_URL")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"links point here (default {DEFAULT_BASE_URL})")
    parser.add_argument("--out", default=str(OUT), help="links CSV (default data/tag_links_production.csv)")
    parser.add_argument("--keep-staff-keys", action="store_true", help="don't issue new staff-portal links")
    args = parser.parse_args()

    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise SystemExit("DATABASE_URL is not set.")
    target = describe_url(url)
    print(f"Target database: {target['host']}:{target['port']}/{target['dbname']} (user {target['user'] or '?'})")
    print(f"Links will use:  {args.base_url}")
    if not args.yes:
        raise SystemExit("Refusing to change it without --yes.")

    run("import_shelters.py", "--schema")
    link_args = ["--base-url", args.base_url, "--out", args.out]
    if not args.keep_staff_keys:
        link_args.append("--rotate-staff-keys")
    run("generate_tag_links.py", *link_args)
    run("reset_demo.py")

    with connect() as conn:
        s = conn.execute(
            "SELECT count(*) AS shelters,"
            " count(*) FILTER (WHERE lat IS NOT NULL AND lng IS NOT NULL) AS with_coords,"
            " count(*) FILTER (WHERE public_phone IS NOT NULL) AS with_phone,"
            " count(*) FILTER (WHERE is_dv) AS dv,"
            " count(*) FILTER (WHERE is_dv AND (address IS NOT NULL OR lat IS NOT NULL)) AS dv_leaks,"
            " coalesce(sum(open_beds), 0) AS open_beds FROM shelters"
        ).fetchone()
        tags = conn.execute("SELECT count(*) AS n FROM tags").fetchone()["n"]
        keys = conn.execute("SELECT count(*) AS n FROM staff_keys").fetchone()["n"]
    print("\nSummary")
    print(f"  shelters:        {s['shelters']} ({s['with_coords']} with coordinates, {s['with_phone']} with a public phone, {s['dv']} DV)")
    print(f"  DV locations:    {'NONE stored (good)' if not s['dv_leaks'] else str(s['dv_leaks']) + ' DV row(s) have a location!'}")
    print(f"  tags / staff keys: {tags} / {keys}")
    print(f"  demo state:      {s['open_beds']} open beds in total")
    print(f"  links CSV:       {args.out} (git-ignored; holds secrets, don't share it)")


if __name__ == "__main__":
    main()
