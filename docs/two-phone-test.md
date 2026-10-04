# Two-phone Tier 1 test

This is the test that unlocks Tier 3 (see CONTRIBUTING.md). Two phones on the same Wi-Fi
connect to the frontend running on this Mac. Setup should take under 2 minutes.

## Steps

1. **Database and backend** (as in the README):
   ```bash
   docker compose up -d
   cd backend && source .venv/bin/activate && python run.py
   ```
2. **Frontend, reachable from phones** (second terminal):
   ```bash
   cd frontend && npm run dev -- --host
   ```
3. **Links and demo data** (third terminal, repo root, backend venv active):
   ```bash
   pip install -r scripts/requirements.txt   # first time only (QR library)
   python scripts/lan_test.py
   python scripts/reset_demo.py
   open data/tag_links_lan.html
   ```
   `lan_test.py` prints this Mac's IP, writes `data/tag_links_lan.csv` and
   `data/tag_links_lan.html` (both git-ignored because they hold tag secrets), and keeps existing
   secrets, so NFC tags you've already written keep working.
4. **Phone A** scans the "Open the map" QR code (`http://<ip>:5173`) and finds shelter-01.
5. **Phone B** scans the "Bed freed (+1)" QR code, or taps a spare NFC tag written with that
   link (NFC Tools app → Write → URL).

`reset_demo.py` sets shelter-01 to 0 beds (it's the "full" demo shelter), so Freed comes
first: it takes the count to 1, and then there's a bed to hold.

## Pass criteria

- [ ] After Phone B taps **Freed**, Phone A's count for shelter-01 changes within 2 seconds,
      without a reload.
- [ ] **Holding** a bed at shelter-01 on Phone A drops the count.
- [ ] Opening the **Arrive** link (on Phone B) confirms that hold.

## Troubleshooting

- **Phone can't load the page.** Both phones must be on the same Wi-Fi as the Mac. Check the
  IP that `lan_test.py` printed matches the Mac's IP in System Settings → Wi-Fi → Details.
  If the Mac changed networks, re-run `lan_test.py`.
- **macOS firewall.** System Settings → Network → Firewall: allow incoming connections for
  `node` (macOS usually asks the first time `npm run dev -- --host` starts; click Allow).
- **Guest or campus Wi-Fi** often blocks device-to-device traffic (client isolation). Turn on
  a phone's hotspot, connect the Mac and the other phone to it, and re-run `lan_test.py`
  (the IP changes).
- **`role "luminest" does not exist`.** Another Postgres (e.g. Homebrew) owns
  `localhost:5432`, hiding the Docker DB. Stop it (`brew services stop postgresql`), or run the
  scripts and backend with `DATABASE_URL` pointing at the Docker port.
- **Count only updates on reload.** The socket isn't connecting: make sure the backend is
  running on port 8000 (Vite proxies `/socket.io` to it).
