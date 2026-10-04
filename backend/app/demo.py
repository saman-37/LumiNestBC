"""Known demo state, shared by scripts/reset_demo.py and the admin hub. Owner: Backend (Person 2).

- one shelter full at 0 (the first general, non-DV shelter)
- one Surrey women-only shelter at 1 bed, updated 2 minutes ago
- every other shelter at 0-3 beds with mixed freshness (green / amber / red)
- every shelter accepting people; all active holds cancelled
Deterministic: the same data gives the same demo every time.
"""
import random

FRESHNESS_MINUTES = (3, 25, 75, 150, 240)  # green, green, amber, amber, red


def _set_beds(conn, shelter: dict, beds: int, minutes_ago: int) -> str:
    if shelter["capacity"]:
        beds = min(beds, shelter["capacity"])
    conn.execute(
        "UPDATE shelters SET open_beds = %s, is_full = %s, accepting = TRUE,"
        " last_updated_at = now() - %s::int * interval '1 minute' WHERE id = %s",
        (beds, beds == 0, minutes_ago, shelter["id"]),
    )
    return f"{shelter['id']:<14} {beds} bed(s), updated {minutes_ago} min ago  {shelter['name']}"


def reset_demo(conn) -> dict:
    """Apply the demo state inside the caller's transaction. Returns a summary."""
    rng = random.Random(2026)
    # Natural id order (shelter-9 before shelter-10), so imported shelters never displace the demo ones.
    shelters = conn.execute("SELECT * FROM shelters ORDER BY length(id), id").fetchall()
    cancelled = conn.execute(
        "UPDATE holds SET status = 'cancelled' WHERE status = 'active' RETURNING id"
    ).fetchall()

    full = next((s for s in shelters if not s["is_dv"] and not s["women_only"]), None)
    surrey = next(
        (s for s in shelters if s["women_only"] and not s["is_dv"] and s is not full
         and "surrey" in f"{s['address'] or ''} {s['name']}".lower()),
        None,
    )
    lines = []
    for shelter in shelters:
        if shelter is full:
            lines.append(_set_beds(conn, shelter, 0, 10))
        elif shelter is surrey:
            lines.append(_set_beds(conn, shelter, 1, 2))
        else:
            lines.append(_set_beds(conn, shelter, rng.randint(0, 3), rng.choice(FRESHNESS_MINUTES)))
    return {"shelters": len(shelters), "holds_cancelled": len(cancelled), "lines": lines,
            "surrey_found": surrey is not None}
