"""Create the 4 NFC tags for every shelter and export their URLs.

    python scripts/generate_tag_links.py                                  # https://luminestbc.tech
    python scripts/generate_tag_links.py --base-url http://localhost:5173 # local testing
    python scripts/generate_tag_links.py --rotate                         # new secrets for all tags

Existing tags keep their secret (so already-written NFC tags keep working) unless --rotate.
Writes data/tag_links.csv, which contains secrets and is git-ignored. Don't commit it.
URL format: <base>/t/<shelter_id>/<action>?k=<secret>
"""
import argparse
import csv
import os
import secrets
import string

from _common import ROOT, TAG_ACTIONS, connect

LABELS = {"freed": "Bed freed (+1)", "filled": "Bed filled (-1)", "full": "We're full (0)",
          "arrive": "Arrival (by the door)"}
ALPHABET = string.ascii_letters + string.digits


def new_secret() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(16))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=os.getenv("TAG_BASE_URL", "https://luminestbc.tech"))
    parser.add_argument("--out", default=str(ROOT / "data" / "tag_links.csv"))
    parser.add_argument("--rotate", action="store_true", help="replace every existing secret")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    links = []
    with connect() as conn:
        shelters = conn.execute("SELECT id, name FROM shelters ORDER BY id").fetchall()
        for shelter in shelters:
            for action in TAG_ACTIONS:
                tag_id = f"{shelter['id']}-{action}"
                existing = conn.execute("SELECT secret FROM tags WHERE id = %s", (tag_id,)).fetchone()
                secret = existing["secret"] if existing and not args.rotate else new_secret()
                conn.execute(
                    "INSERT INTO tags (id, shelter_id, action, secret) VALUES (%s, %s, %s, %s)"
                    " ON CONFLICT (id) DO UPDATE SET secret = EXCLUDED.secret",
                    (tag_id, shelter["id"], action, secret),
                )
                links.append({"shelter_id": shelter["id"], "shelter_name": shelter["name"],
                              "action": action, "label": LABELS[action],
                              "url": f"{base}/t/{shelter['id']}/{action}?k={secret}"})

    with open(args.out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["shelter_id", "shelter_name", "action", "label", "url"])
        writer.writeheader()
        writer.writerows(links)

    for link in links:
        print(f"{link['shelter_id']:<14} {link['label']:<22} {link['url']}")
    print(f"\n{len(links)} tag link(s) for {len(shelters)} shelter(s) -> {args.out}")


if __name__ == "__main__":
    main()
