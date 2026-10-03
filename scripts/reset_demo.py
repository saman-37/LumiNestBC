"""Put the database into a known demo state (run right before judging).

    python scripts/reset_demo.py

- one shelter full at 0 (the first general, non-DV shelter)
- one Surrey women-only shelter at 1 bed, updated 2 minutes ago
- every other shelter at 0-3 beds with mixed freshness (green / amber / red)
- all active holds cancelled
Deterministic: the same data gives the same demo every time.
Open apps refresh within 60 s, or reload them.
"""
import random

from _common import connect

FRESHNESS_MINUTES = (3, 25, 75, 150, 240)  # green, green, amber, amber, red


def set_beds(conn, shelter, beds: int, minutes_ago: int) -> None:
    if shelter["capacity"]:
        beds = min(beds, shelter["capacity"])
    conn.execute(
        "UPDATE shelters SET open_beds = %s, is_full = %s,"
        " last_updated_at = now() - %s::int * interval '1 minute' WHERE id = %s",
        (beds, beds == 0, minutes_ago, shelter["id"]),
    )
    print(f"  {shelter['id']:<14} {beds} bed(s), updated {minutes_ago} min ago  {shelter['name']}")


def main() -> None:
    rng = random.Random(2026)
    with connect() as conn:
        shelters = conn.execute("SELECT * FROM shelters ORDER BY id").fetchall()
        if not shelters:
            raise SystemExit("No shelters. Run scripts/import_shelters.py first.")

        cancelled = conn.execute(
            "UPDATE holds SET status = 'cancelled' WHERE status = 'active' RETURNING id"
        ).fetchall()

        full = next((s for s in shelters if not s["is_dv"] and not s["women_only"]), None)
        surrey = next(
            (s for s in shelters if s["women_only"] and not s["is_dv"] and s is not full
             and "surrey" in f"{s['address'] or ''} {s['name']}".lower()),
            None,
        )
        if surrey is None:
            print("  ! no Surrey women-only shelter found; skipping that demo row")

        for shelter in shelters:
            if shelter is full:
                set_beds(conn, shelter, 0, 10)
            elif shelter is surrey:
                set_beds(conn, shelter, 1, 2)
            else:
                set_beds(conn, shelter, rng.randint(0, 3), rng.choice(FRESHNESS_MINUTES))

    print(f"demo reset: {len(shelters)} shelter(s), {len(cancelled)} active hold(s) cancelled")


if __name__ == "__main__":
    main()
