# Architecture

```
 NFC tag (plain URL)          Outreach worker phone          Caller (any phone)
        │ opens                       │                             │ dials
        ▼                             ▼                             ▼
 ┌─────────────────────────────────────────────┐            ┌──────────────┐
 │ Frontend PWA (React + Vite, Vercel)          │            │ Twilio       │
 │  /t/:shelter/:action   /   /hold/:id  /staff │            └──────┬───────┘
 └──────────────┬──────────────────▲────────────┘                   │ webhooks
           REST │ POST/GET         │ Socket.IO shelter_update        │
                ▼                  │                                ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ Backend (Flask + Flask-SocketIO, gunicorn -w 1 --threads 100, Render)   │
 │  routes/  shelters · tags · holds        comms/  twilio · gemini ·      │
 │  availability.py (all bed changes)               matcher · voice        │
 │  jobs.py (expire holds every 60 s)                                      │
 └──────────────────────────────┬──────────────────────────────────────────┘
                                ▼
          PostgreSQL + TimescaleDB (Tiger Data cloud; docker locally)
          shelters · tags · holds · processed_taps · availability_events (hypertable)
```

## Key flows

**Tag tap.** The tag URL `https://luminestbc.tech/t/shelter-03/freed?k=SECRET` opens
`TapPage`, which creates one `tap_id` and POSTs `{k, tap_id}`. In one transaction the
server: locks the tag row, checks the secret, records the `tap_id` (a repeat is answered
with `duplicate`), ignores the same tag within 5 s (`ignored_cooldown`), applies the change
through `change_beds()`, and logs an `availability_events` row. After commit it emits
`shelter_update`. The page shows the new count and an Undo button for 10 s.

**Hold.** `POST /api/holds` runs `SELECT ... FOR UPDATE` on the shelter, checks
`open_beds >= 1`, decrements, inserts the hold (expires in 60 min) and logs, all in one
transaction. When two workers race for the last bed, one gets `201` and the other gets
`409 just_taken`.

**Arrival.** Staff tap the Arrival tag by the door. One active hold is confirmed
automatically. With several, the page lists them to choose from. A hold already took the
bed, so arrival logs `delta 0`.

**Expiry.** `jobs.expire_holds()` runs every 60 s, expires holds that are past due, gives
the bed back (`source='expiry'`) and emits updates.

**Voice line (Tier 2).** Twilio speech goes to `gemini.extract_voice_request()` (JSON
only, no names). `matcher.rank_shelters()` ranks real rows by distance plus staleness.
`voice.py` speaks the top two, and DV matches are given only as a phone number.

## Rules the code enforces

- `public_shelter()` is the only way a shelter leaves the server. It nulls DV
  address, coordinates and staff phone.
- All bed changes go through `change_beds()`: row-locked, clamped at 0 (plus a DB
  `CHECK`), always logged.
- Freshness (`last_updated_at`) moves only on staff actions (taps, undo, arrival, SMS), never
  on holds or expiries.
- Emits happen after commit.
- One gunicorn worker, so Socket.IO and jobs need no message queue.

All tunable numbers are in `backend/app/config.py`.
