# LuminestBC

**Find the lights still on.**

A live shelter-bed network for Metro Vancouver, built at StormHacks 2026.

- **Tap Board.** Each shelter's front desk has three NFC tags: *Bed freed* (+1), *Bed filled* (−1) and *We're full* (sets 0). An *Arrival* tag by the door confirms an outreach worker's bed hold. Each tag stores a plain URL, so one tap updates the count from any phone with no app needed.
- **Outreach workers** get a live dark map where shelters with open beds glow. It has filters, freshness badges and a 60-minute bed hold.
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
python scripts/import_shelters.py                                  # data/shelters_template.csv
python scripts/generate_tag_links.py --base-url http://localhost:5173
python scripts/reset_demo.py                                       # known demo state
```

To use real data, put BC211 rows in a CSV with the same columns as `data/shelters_template.csv`
and run `python scripts/import_shelters.py data/your_file.csv`.

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

### Tests

```bash
cd backend && source .venv/bin/activate && pytest
```

The tests need `docker compose up -d`. They use a separate `luminestbc_test` database that
is created and wiped automatically.

### Map tiles

The map uses CARTO dark tiles when `VITE_CARTO_KEY` is set (free key at
[carto.com/basemaps](https://carto.com/basemaps)). Without a key it falls back to
OpenStreetMap tiles darkened with CSS, so it works out of the box.

## Deploy

**Database (Tiger Data).** Create a TimescaleDB service, copy its connection string, then apply
the schema and seed data:

```bash
DATABASE_URL='postgres://...' python scripts/import_shelters.py --schema
DATABASE_URL='postgres://...' python scripts/generate_tag_links.py   # https://luminestbc.tech links
```

**Backend (Render).** New → Blueprint → this repo. `render.yaml` runs
`gunicorn -w 1 --threads 100 wsgi:app` from `backend/`. Set `DATABASE_URL`, then set
`BACKEND_PUBLIC_URL` to the Render URL. Keep **one worker**: Socket.IO and the hold-expiry
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
