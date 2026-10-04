# LuminestBC

**Find the lights still on.**

A live shelter-bed network for Metro Vancouver, built at StormHacks 2026.

- **Tap Board.** Each shelter's front desk has three NFC tags: *Bed freed* (+1), *Bed filled* (−1) and *We're full* (sets 0). An *Arrival* tag by the door confirms an outreach worker's bed hold. Each tag stores a plain URL, so one tap updates the count from any phone with no app needed.
- **Outreach workers** get a live map where shelters with open beds glow. It has filters, freshness badges and a 60-minute bed hold.
- **Staff portal.** Each shelter gets a private link (no passwords) to fix a miscount, revert a mistaken tap, release a hold, change tonight's settings and rewrite a lost tag.
- **Voice line (Tier 2).** People without smartphones call a number. Gemini turns their words into JSON, Python ranks real beds, and ElevenLabs speaks the answer.
- **Privacy.** Nothing is stored about the people being sheltered. Holds keep only the worker's name and org. Domestic violence (DV) shelters never expose an address or coordinates; they show only "DV bed available: call [phone]".

Stack: React + Vite + TypeScript PWA (Vercel) · Flask + Socket.IO (Render) · PostgreSQL + TimescaleDB (Tiger Data).
See [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Local setup

You need Docker, Python 3.11+ and Node 20+.

```bash
cp .env.example .env
docker compose up -d                      # Postgres + TimescaleDB, schema applied automatically

# Backend: http://localhost:8000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run.py

# Frontend: http://localhost:5173 (in a second terminal)
cd frontend
npm install
npm run dev
```

### Seed data (repo root, backend venv active)

```bash
python scripts/import_shelters.py --schema                         # data/shelters.csv; --schema also migrates an older DB
python scripts/generate_tag_links.py --base-url http://localhost:5173
python scripts/reset_demo.py                                       # known demo state
```

`generate_tag_links.py` writes `data/tag_links.csv` (git-ignored, contains secrets) with one row
per shelter: its **staff portal link** and its four tag links. Staff keys are stored only as a
hash, so a portal link is printed only when the key is created; run with
`--rotate-staff-keys` to issue new links (old ones stop working).

**Already have a database?** Re-run the schema once to add the new columns and tables (safe to
run any number of times): `python scripts/import_shelters.py --schema`.

**Open shelter data.** Download "Homeless shelter locations" (CSV or GeoJSON) from the
[City of Vancouver Open Data Portal](https://opendata.vancouver.ca) (Open Government Licence –
Vancouver), then:

```bash
python scripts/import_open_data.py ~/Downloads/homeless-shelter-locations.csv --dry-run   # preview
python scripts/import_open_data.py ~/Downloads/homeless-shelter-locations.csv
```

It maps whatever columns exist, skips anything that looks like a DV / transition house, never
imports phone numbers, and doesn't touch shelters from other sources. New shelters start at 0
beds and "unconfirmed". We don't scrape bc.211.ca (its terms prohibit it). See
[data/SOURCES.md](data/SOURCES.md).

**BC211 shelter list** (used with BC211's permission). Put the PDFs in `data/bc211/`, then:

```bash
pip install -r backend/requirements.txt                  # adds pdfplumber
python scripts/import_bc211.py --dry-run                 # parse + match, show what would change
python scripts/import_bc211.py                           # parse -> data/bc211_shelters.csv -> geocode -> import
python scripts/generate_tag_links.py --base-url http://localhost:5173   # tags + staff links for the new shelters
```

It prints rows found / parsed / skipped (and why) per PDF, every match with an existing
shelter, and a "needs coordinates" list. Missing coordinates are looked up on OpenStreetMap
Nominatim (1 request per second, cached in `data/geocode_cache.json`). Fix anything by editing
`data/bc211_shelters.csv` (e.g. add lat/lng) and running `python scripts/import_bc211.py --from-csv`.
Re-running never duplicates. DV / transition / safe houses are skipped, phone numbers are never
imported, the demo shelters (`shelter-20`, `shelter-21`) are never touched, and new shelters start
at 0 beds and "unconfirmed": BC211's bed counts are never shown as availability. `--debug` prints
the raw table rows if a new PDF layout doesn't parse.

### Test a tag link locally

`generate_tag_links.py` prints one URL per tag and writes them to `data/tag_links.csv`
(git-ignored because it contains secrets). Open one in the browser:

```
http://localhost:5173/t/shelter-01/freed?k=<secret>
```

You should see the new count, "+1 bed freed" and an Undo button for 10 seconds. With the
map open in another tab, the pin pulses and updates instantly.

**On a real phone:** run `npm run dev -- --host` and regenerate links with
`--base-url http://<your-laptop-LAN-IP>:5173`. Write a URL onto an NFC tag (NFC Tools
app → Write → URL) and tap it. Only the frontend port needs to be reachable, because Vite
proxies the API.

### Staff portal

Open a shelter's staff link from `data/tag_links.csv`, e.g.
`http://localhost:5173/staff/shelter-01#key=<key>`. The key moves into the browser's storage and
disappears from the address bar (the `#key=` part never reaches server logs). Without a key the
page shows a locked screen and no worker names.

### Admin / test hub

Set `ADMIN_KEY` in `.env` (and `DEV_TOOLS_ENABLED=true`, the default locally), restart the
backend, then open `http://localhost:5173/admin` and enter the key once.

- **Shelters:** every shelter with its live count, freshness, a staff-portal button and its four
  tag links as buttons (each one is a real tap: the backup if NFC fails during judging), plus
  *Reset demo data*, *Expire all holds* and *Make stale* (4 hours old).
- **Voice line** (`/admin/voice`): speak (or type) like a caller, or pick a rehearsed line. Runs
  the real pipeline and plays greeting → filler → answer, with a debug panel (extracted JSON,
  matches, timings). Without ElevenLabs the browser reads the lines, like Twilio's `<Say>` would.
- **SMS** (`/admin/sms`): send a staff text as a shelter's staff phone and watch the count change.

Production keeps all of this off (`DEV_TOOLS_ENABLED=false` in `render.yaml`).

### Test the real phone line

Twilio needs a public URL. Serve everything from one port and tunnel it:

1. `scripts/dev_public.sh` (builds the frontend and starts the backend on port 8000, serving the app too).
2. In another terminal: `ngrok http 8000`, and copy the `https://….ngrok-free.app` URL.
3. In `.env` set `BACKEND_PUBLIC_URL` and `TAG_BASE_URL` to that URL (and add it to `FRONTEND_ORIGIN`). Restart `scripts/dev_public.sh`.
4. Regenerate links for the tunnel: `python scripts/generate_tag_links.py --base-url <ngrok URL> --rotate-staff-keys`.
5. In the Twilio console, on your number: **Voice** "A call comes in" → Webhook `<ngrok URL>/twilio/voice` (HTTP POST); **Messaging** "A message comes in" → `<ngrok URL>/twilio/sms` (HTTP POST).
6. Set `TWILIO_AUTH_TOKEN` in `.env` so requests are signature-checked (the check uses `BACKEND_PUBLIC_URL`, so it works behind the tunnel).
7. Call the number from a phone that isn't registered with Twilio. For SMS updates, text from a number saved as a shelter's staff phone (staff portal → Tonight's settings).

Audio for the fixed phrases is generated at startup; answers take about a second with
`ELEVENLABS_MODEL=eleven_flash_v2_5`.

### Tests

```bash
cd backend && source .venv/bin/activate && pytest
```

The tests need `docker compose up -d`. They use a separate `luminestbc_test` database that
is created and wiped automatically.

### Map tiles

The map uses OpenFreeMap vector tiles (no key), restyled in `frontend/src/lib/mapStyle.ts`. If
OpenFreeMap is unreachable it falls back to CARTO Voyager (`VITE_CARTO_KEY`) or OpenStreetMap.

## Deploy

**Database (Tiger Data).** Create a TimescaleDB service, copy its connection string, then apply
the schema and seed data:

```bash
DATABASE_URL='postgres://...' python scripts/import_shelters.py --schema
DATABASE_URL='postgres://...' python scripts/generate_tag_links.py   # https://luminestbc.tech links
```

**Backend (Render).** New → Blueprint → this repo. `render.yaml` runs
`gunicorn -w 1 --threads 100 wsgi:app` from `backend/`. Set `DATABASE_URL`, then set
`BACKEND_PUBLIC_URL` to the Render URL. `render.yaml` turns dev tools off. Keep **one worker**: Socket.IO and the hold-expiry
job live in that process.

**Frontend (Vercel).** Import the repo with **Root Directory** set to `frontend` (framework: Vite).
Set `VITE_API_URL` to the Render URL (no trailing slash) and optionally `VITE_GOOGLE_MAPS_KEY` and `VITE_CARTO_KEY`.
These are baked in at build time, so redeploy after changing them. `vercel.json` rewrites
every path to `index.html`, so `/t/...` tag links work on refresh. Then set `FRONTEND_ORIGIN` on Render to the
Vercel URL (and `https://luminestbc.tech,https://www.luminestbc.tech` once the domain is added).

## Repo map

| Path | Owner | What |
|---|---|---|
| `frontend/` | Frontend (Person 1) | PWA: map, hold, tag, staff screens (`src/pages/`) |
| `backend/app/` | Backend (Person 2) | API, sockets, jobs, DB |
| `backend/app/comms/` | Communications (Person 3) | Twilio, Gemini, ElevenLabs, matcher |
| `scripts/`, `data/`, `satellite/` | Design/data (Person 4) | import, tag links, demo reset |
