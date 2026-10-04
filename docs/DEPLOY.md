# Deploying LuminestBC: the hand checklist

Three services: **Tiger Data** (Postgres + TimescaleDB), **Render** (backend API,
`https://luminestbc-api.onrender.com`) and **Vercel** (frontend, `https://lumi-nest-bc.vercel.app`).
Everything below is done by a person, in this order. Commands run from the repo root with the
backend venv active (`source backend/.venv/bin/activate`).

## 1. Database (Tiger Data)

- [ ] Tiger Data console → your service → **Connect** → copy a fresh connection string. It must end
      in **`?sslmode=require`** (with the final "e"; `sslmode=requir` is rejected by Postgres).
- [ ] If the password has special characters, URL-encode them (`@` → `%40`, `#` → `%23`, `/` → `%2F`,
      `:` → `%3A`).
- [ ] Check it from your laptop (prints a diagnosis, never the password):
      ```bash
      export PROD_DATABASE_URL='postgres://tsdbadmin:...@xxxx.tsdb.cloud.timescale.com:PORT/tsdb?sslmode=require'
      DATABASE_URL="$PROD_DATABASE_URL" python scripts/check_db.py
      ```
- [ ] If Tiger Data has an **IP allowlist** on, add Render's outbound IPs (Render dashboard →
      luminestbc-api → **Connect** → Outbound) and your own IP.

**Usual fixes when the backend can't connect** (the Render log line starts with
`DATABASE UNREACHABLE` and includes a hint): a fresh string from Tiger Data's Connect button;
`?sslmode=require` spelled in full; URL-encoded special characters in the password; Render's IPs
on the allowlist; the Tiger Data service not paused.

## 2. Seed the production database (once)

```bash
DATABASE_URL="$PROD_DATABASE_URL" python scripts/seed_production.py --yes
```

It prints the host it's about to change and refuses without `--yes`. It applies the schema,
imports the 67 shelters from `data/shelters.csv` (with coordinates and public phones), keeps
existing tag secrets (written tags keep working), issues new staff-portal links, writes every link
to **`data/tag_links_production.csv`** (git-ignored; holds secrets) with base
`https://lumi-nest-bc.vercel.app`, puts the shelters in the demo state, and prints a summary.
Add `--keep-staff-keys` to keep staff links already handed out.

## 3. Backend (Render)

- [ ] Render → **New → Blueprint** → this repo (or the existing `luminestbc-api` service →
      **Manual sync** after pushing). `render.yaml` sets root `backend`, the start command
      `gunicorn -w 1 --threads 100 -b 0.0.0.0:$PORT wsgi:app` and health check `/health`.
- [ ] Set these in Render → luminestbc-api → **Environment** (the ones with a value in
      `render.yaml` are already set; check they match):

| Variable | What it is | Where to get it |
|---|---|---|
| `DATABASE_URL` | Tiger Data connection string, ending `?sslmode=require` | Step 1 |
| `FRONTEND_ORIGIN` | Browser origins allowed for the API and Socket.IO, comma-separated, no trailing slash: `https://lumi-nest-bc.vercel.app,https://luminestbc.tech,https://www.luminestbc.tech` | Preset in `render.yaml` |
| `BACKEND_PUBLIC_URL` | `https://luminestbc-api.onrender.com` (Twilio signatures and voice audio links use it) | Preset |
| `TAG_BASE_URL` | `https://lumi-nest-bc.vercel.app` (switch to `https://luminestbc.tech` once the domain works) | Preset |
| `DEV_TOOLS_ENABLED` | `true`: the admin hub stays on for the demo, behind `ADMIN_KEY` | Preset |
| `ADMIN_KEY` | Long random secret for `/admin`: `python -c "import secrets;print(secrets.token_urlsafe(32))"` | You make it |
| `TWILIO_ACCOUNT_SID` | Account SID | console.twilio.com → Account info |
| `TWILIO_AUTH_TOKEN` | Auth token. Also turns on webhook signature checks | console.twilio.com → Account info |
| `TWILIO_PHONE_NUMBER` | The voice-line number, E.164 (`+1604…`) | Twilio → Phone Numbers |
| `GEMINI_API_KEY` | Gemini key (JSON extraction only) | aistudio.google.com → Get API key |
| `ELEVENLABS_API_KEY` | Text-to-speech key | elevenlabs.io → Profile → API keys |
| `ELEVENLABS_VOICE_ID` | The voice to speak with | elevenlabs.io → Voices → ID |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` (low latency) | Preset |
| `AUTO_MIGRATE` | `true`: apply the schema on every start (idempotent) | Preset |

- [ ] **Upgrade the instance from Free to Starter before judging.** Free instances sleep after 15
      minutes idle (the first request then takes ~50 s, open apps show "Reconnecting…", and holds
      don't expire on time).
- [ ] Deploy, then check the log shows `database ready at …; schema applied` and no
      `DATABASE UNREACHABLE` line. `https://luminestbc-api.onrender.com/health` → `{"ok": true}`.

## 4. Frontend (Vercel)

- [ ] Project settings → **Root Directory** `frontend`, framework **Vite**.
      `frontend/vercel.json` rewrites every path to `index.html` (so `/t/…`, `/staff/…`,
      `/hold/…`, `/admin` load on refresh), caches `/assets/*` for a year and never caches
      `index.html`.
- [ ] **Environment variables** (Production). `VITE_*` values are baked in at build time, so
      **redeploy after changing any of them**:

| Variable | What it is | Where to get it |
|---|---|---|
| `VITE_API_URL` | `https://luminestbc-api.onrender.com` (no trailing slash) | Render URL |
| `VITE_GOOGLE_MAPS_KEY` | Street View photos (optional). Restrict it to your HTTP referrers | Google Cloud console → Credentials |
| `VITE_CARTO_KEY` | Backup map tiles (optional) | carto.com |

## 5. Twilio

- [ ] Twilio console → Phone Numbers → your number:
  - **Voice** → "A call comes in" → Webhook `https://luminestbc-api.onrender.com/twilio/voice`, HTTP POST.
  - **Messaging** → "A message comes in" → Webhook `https://luminestbc-api.onrender.com/twilio/sms`, HTTP POST.
- [ ] Trial account: add the demo phones under **Verified Caller IDs** (trial numbers only take calls
      from, and text, verified numbers, and play a trial notice first).
- [ ] Staff SMS demo: put a teammate's number as the demo shelter's staff phone (staff portal →
      Tonight's settings). Real shelters never get automated texts.

## 6. Domain (`luminestbc.tech` → Vercel)

- [ ] Vercel → Project → Settings → **Domains** → add `luminestbc.tech` and `www.luminestbc.tech`.
- [ ] At the domain registrar, add the DNS records Vercel shows (usually `A @ 76.76.21.21` and
      `CNAME www cname.vercel-dns.com`). Wait for Vercel to show "Valid configuration".
- [ ] Render: `FRONTEND_ORIGIN` already lists both. If you want tags and staff links on the domain,
      set `TAG_BASE_URL=https://luminestbc.tech` and regenerate links
      (`seed_production.py --base-url https://luminestbc.tech --yes`), then rewrite the tags.
- [ ] Add `https://luminestbc.tech/*` to the Google key's allowed referrers.

## 7. NFC tags

- [ ] Write the demo shelter's four links onto tags and test them: [docs/NFC_SETUP.md](NFC_SETUP.md).
- [ ] Print its Tap Board from the staff portal (Tap Board tags → Print).

## 8. Final smoke test

After pushing and both deploys finish:

```bash
ADMIN_KEY='<the production admin key>' python scripts/smoke_test.py \
    --api https://luminestbc-api.onrender.com --web https://lumi-nest-bc.vercel.app
```

It prints a PASS/FAIL table: health; all shelters with coordinates and no DV locations; the SPA
routes on Vercel; a real tag tap on `shelter-01`, a hold and its cancel, and undo (the count is
restored); Socket.IO from the Vercel origin receiving `shelter_update`; `/twilio/voice` without a
signature rejected (403); the voice simulator with audio URLs (or which key is missing); Street
View metadata if `VITE_GOOGLE_MAPS_KEY` is set in your shell. Add `--reset-demo` to re-apply the
full demo state afterwards. Exit code 1 if anything failed.

Then by hand, on two phones: tap a tag on one and watch the count change on the other; hold a bed
and confirm it with the Arrival tag; call the number and hear live options.
