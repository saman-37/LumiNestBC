"""Put the database into a known demo state (run right before judging).

    python scripts/reset_demo.py

Same logic as the admin hub's "Reset demo data" button (backend/app/demo.py):
- one shelter full at 0 (the first general, non-DV shelter)
- one Surrey women-only shelter at 1 bed, updated 2 minutes ago
- every other shelter at 0-3 beds with mixed freshness (green / amber / red)
- every shelter accepting people; all active holds cancelled
Deterministic: the same data gives the same demo every time.
Open apps refresh within 60 s, or reload them (the admin button updates them live).
"""
from _common import connect

from app.demo import reset_demo


def main() -> None:
    with connect() as conn:
        summary = reset_demo(conn)
    if not summary["shelters"]:
        raise SystemExit("No shelters. Run scripts/import_shelters.py first.")
    for line in summary["lines"]:
        print(f"  {line}")
    if not summary["surrey_found"]:
        print("  ! no Surrey women-only shelter found; skipping that demo row")
    print(f"demo reset: {summary['shelters']} shelter(s), {summary['holds_cancelled']} active hold(s) cancelled")


if __name__ == "__main__":
    main()
