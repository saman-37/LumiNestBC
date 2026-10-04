"""Set up the two-phone Tier 1 test over this Mac's Wi-Fi (see docs/two-phone-test.md).

    pip install -r scripts/requirements.txt   # once, for QR codes
    python scripts/lan_test.py

- finds this Mac's LAN IP (en0 first, then other interfaces)
- regenerates tag links for http://<ip>:5173 into data/tag_links_lan.csv (secrets kept, no --rotate)
- writes data/tag_links_lan.html: shelter-01's four links as big buttons + QR codes, and the map link
Both output files contain tag secrets and are git-ignored. Don't commit them.
"""
import csv
import html
import ipaddress
import re
import socket
import subprocess
import sys

import segno

from _common import ROOT, TAG_ACTIONS

PORT = 5173
SHELTER_ID = "shelter-01"
CSV_OUT = ROOT / "data" / "tag_links_lan.csv"
HTML_OUT = ROOT / "data" / "tag_links_lan.html"


def usable(ip: str) -> bool:
    try:
        addr = ipaddress.IPv4Address(ip)
    except ValueError:
        return False
    return addr.is_private and not addr.is_loopback and not addr.is_link_local


def lan_ip() -> str:
    """en0 (Wi-Fi on most Macs) first, then any other interface with a private IPv4."""
    for iface in ("en0", "en1"):
        try:
            ip = subprocess.run(["ipconfig", "getifaddr", iface], capture_output=True,
                                text=True, timeout=5).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            ip = ""
        if usable(ip):
            print(f"LAN IP: {ip} ({iface})")
            return ip
    try:
        out = subprocess.run(["ifconfig"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        out = ""
    iface = None
    for line in out.splitlines():
        if line and not line[0].isspace():
            iface = line.split(":")[0]
        match = re.search(r"\binet (\d+\.\d+\.\d+\.\d+)", line)
        if match and usable(match.group(1)) and not (iface or "").startswith(("utun", "bridge")):
            print(f"LAN IP: {match.group(1)} ({iface})")
            return match.group(1)
    # Last resort: the address the OS would route out of (no packet is sent).
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
        except OSError:
            ip = ""
    if usable(ip):
        print(f"LAN IP: {ip} (default route)")
        return ip
    raise SystemExit("Couldn't find a LAN IP. Is this Mac on Wi-Fi?")


def generate_links(base: str) -> list[dict]:
    cmd = [sys.executable, str(ROOT / "scripts" / "generate_tag_links.py"),
           "--base-url", base, "--out", str(CSV_OUT)]
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        raise SystemExit("generate_tag_links.py failed. Is the database running (docker compose up -d)?")
    print(result.stdout.strip().splitlines()[-1])
    with open(CSV_OUT, newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["shelter_id"] == SHELTER_ID]
    order = {a: i for i, a in enumerate(TAG_ACTIONS)}
    rows.sort(key=lambda r: order[r["action"]])
    if len(rows) != len(TAG_ACTIONS):
        raise SystemExit(f"Expected {len(TAG_ACTIONS)} links for {SHELTER_ID}, got {len(rows)}. "
                         "Run scripts/import_shelters.py first.")
    return rows


def card(label: str, url: str) -> str:
    qr = segno.make(url, error="m").svg_inline(scale=6, border=2)
    return (f'<section><a class="btn" href="{html.escape(url)}">{html.escape(label)}</a>'
            f'<div class="qr">{qr}</div><code>{html.escape(url)}</code></section>')


def write_html(map_url: str, rows: list[dict]) -> None:
    name = html.escape(rows[0]["shelter_name"])
    cards = "\n".join([card("Open the map (Phone A)", map_url)]
                      + [card(r["label"], r["url"]) for r in rows])
    HTML_OUT.write_text(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LAN tag links</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 0 auto; padding: 16px; max-width: 640px;
         background: #fff; color: #111; }}
  p {{ color: #555; }}
  section {{ border: 1px solid #ddd; border-radius: 12px; padding: 16px; margin: 16px 0; text-align: center; }}
  .btn {{ display: block; padding: 18px; font-size: 1.3rem; font-weight: 600; border-radius: 10px;
          background: #1d4ed8; color: #fff; text-decoration: none; }}
  .qr svg {{ margin-top: 12px; max-width: 100%; height: auto; }}
  code {{ display: block; font-size: .75rem; word-break: break-all; color: #666; }}
</style></head><body>
<h1>Two-phone test</h1>
<p>{html.escape(SHELTER_ID)} &middot; {name}. Contains tag secrets: don't share or commit this page.</p>
{cards}
</body></html>
""")


def main() -> None:
    ip = lan_ip()
    base = f"http://{ip}:{PORT}"
    rows = generate_links(base)
    write_html(base, rows)

    print(f"\nMap (Phone A):     {base}")
    for r in rows:
        print(f"{r['label']:<22} {r['url']}")
    print(f"\nWrote {CSV_OUT.relative_to(ROOT)} and {HTML_OUT.relative_to(ROOT)}\n")
    print("Next steps:")
    print("  1. Frontend running with:  cd frontend && npm run dev -- --host")
    print("  2. Reset demo data:        python scripts/reset_demo.py")
    print(f"  3. Open the QR page on this Mac:  open {HTML_OUT.relative_to(ROOT)}")
    print(f"  4. Phone A scans 'Open the map'; Phone B scans 'Bed freed (+1)'.")
    print(f"     Phone A's count for {SHELTER_ID} should change within 2 seconds.")
    print("  Full steps and troubleshooting: docs/two-phone-test.md")


if __name__ == "__main__":
    main()
