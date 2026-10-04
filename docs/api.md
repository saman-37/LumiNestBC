# LuminestBC API contract

Frontend and backend both work against this file. Change it in the same PR as any API
change, and mirror it in `frontend/src/lib/types.ts`.

- Base URL: `VITE_API_URL` (production backend on Render). In local dev it's empty and Vite proxies `/api` and `/socket.io` to `http://localhost:8000`.
- JSON in, JSON out. Timestamps are ISO 8601 with a UTC offset.
- Errors look like `{"error": "<code>"}` with a 4xx status.
- **GET never changes data.**

## The Shelter object

Every shelter that leaves the server (REST responses and socket events) has exactly this shape.

```json
{
  "id": "shelter-01",
  "name": "Example Lantern House",
  "address": "100 Example St Vancouver BC",
  "lat": 49.2812,
  "lng": -123.0995,
  "capacity": 40,
  "open_beds": 3,
  "is_full": false,
  "women_only": false, "youth": false, "families": false,
  "pets_ok": true, "accessible": true, "couples": false,
  "is_dv": false,
  "dv_phone": null,
  "staff_phone": "604-555-0101",
  "accepting": true,
  "last_update_source": "tap",
  "last_updated_at": "2026-10-03T23:04:35.902808+00:00",
  "minutes_since_update": 17,
  "freshness": "green"
}
```

- `freshness` is `green` under 60 min, `amber` from 60 to 180 min, and `red` over 180 min since staff last confirmed the count.
- `accepting` is `false` when staff turned off "accepting new people" tonight: no holds (`409 not_accepting`), not offered by the voice line, shown like a full shelter.
- `last_update_source` is what last changed the count: `tap`, `sms`, `staff`, `hold`, `arrival`, `expiry` or `undo` (or `null` if never changed).
- **DV shelters** (`is_dv: true`) always have `address`, `lat`, `lng` and `staff_phone` set to `null`, and carry `dv_phone`. The UI shows only "DV bed available: call [dv_phone]" and never draws a pin.

## The Hold object

```json
{
  "id": "6ae26ff4-5a11-419a-ac8e-3f1c0b6c2d11",
  "shelter_id": "shelter-02",
  "worker_name": "Ana",
  "worker_org": "Downtown Outreach",
  "created_at": "2026-10-03T23:22:20+00:00",
  "expires_at": "2026-10-04T00:22:20+00:00",
  "status": "active",
  "minutes_left": 59
}
```
`status` is one of `active`, `arrived`, `expired` or `cancelled`.

---

## Shelters

### `GET /api/shelters`
```json
{ "shelters": [ <Shelter>, ... ], "generated_at": "2026-10-03T23:21:44+00:00" }
```

### `GET /api/shelters/<id>`
`{ "shelter": <Shelter> }`, or `404 {"error": "shelter_not_found"}`

### `GET /api/shelters/<id>/holds` (needs `X-Staff-Key`)
Active holds, soonest expiry first. Holds name outreach workers, so this needs the shelter's
staff key (see Staff portal). `{ "holds": [ <Hold>, ... ] }`

### `GET /api/shelters/<id>/events?limit=20` (needs `X-Staff-Key`)
Recent events, newest first (`limit` is 1 to 100): `{ "events": [ <Event>, ... ] }`

## The Event object

```json
{ "id": 4182, "time": "2026-10-03T23:22:20+00:00", "delta": -1, "open_beds_after": 0,
  "source": "tap", "reverted": false, "reverts_event_id": null, "revertable": true }
```
`source` is one of `tap`, `sms`, `staff`, `hold`, `arrival`, `expiry` or `undo`. `revertable`
is true for a `tap`/`sms`/`staff` change from the last 60 minutes with a non-zero delta that
hasn't been reverted and isn't itself a revert. A revert has `reverts_event_id` set.

## Tags

### `POST /api/tags/<shelter_id>/<action>`
`action` is one of `freed` (+1), `filled` (−1), `full` (set to 0) or `arrive`.

Request (the page creates `tap_id` once per page load and reuses it on retry):
```json
{ "k": "lFu54KYsPfQeDJnM", "tap_id": "0b9c6f0e-4a8e-4c4e-9a53-8f0d7c0c2a10" }
```

Response `200` for bed actions:
```json
{ "status": "applied", "action": "freed", "tap_id": "0b9c...", "delta": 1,
  "undo_seconds": 10, "open_beds": 4, "shelter": <Shelter> }
```

| `status` | Meaning |
|---|---|
| `applied` | Change made. `delta` is what actually changed (e.g. `0` for "filled" at 0). |
| `duplicate` | This `tap_id` was already processed. Nothing changed. |
| `ignored_cooldown` | The same tag was tapped within 5 s. Nothing changed. |
| `arrived` | (arrive) The only active hold was confirmed. Includes `hold`. |
| `choose_hold` | (arrive) Several active holds. Includes `holds`; confirm one with `POST /api/holds/<id>/arrive`. |
| `no_active_holds` | (arrive) Nothing to confirm. |

Errors: `400 missing_k_or_tap_id`, `403 invalid_tag`, `404 unknown_action`.

### `POST /api/undo`
Reverses a tap made within the last 10 s.
```json
{ "tap_id": "0b9c..." }
```
→ `200 {"status": "undone", "tap_id": "...", "delta": -1, "open_beds": 3, "shelter": <Shelter>}`,
or `200 {"status": "nothing_to_undo"}` (the tap changed nothing).
Errors: `404 tap_not_found`, `409 already_undone`, `409 undo_window_passed`.

## Holds

### `POST /api/holds`
```json
{ "shelter_id": "shelter-02", "worker_name": "Ana", "worker_org": "Downtown Outreach" }
```
→ `201 { "hold": <Hold>, "shelter": <Shelter> }`
Errors: `400 missing_fields`, `404 shelter_not_found`, **`409 {"error": "just_taken"}`** (no bed left),
`409 not_accepting` (staff turned off "accepting new people").

### `GET /api/holds/<id>`
`{ "hold": <Hold>, "shelter": <Shelter> }`, or `404 hold_not_found`

### `POST /api/holds/<id>/arrive`
→ `200 { "status": "arrived", "hold": <Hold>, "shelter": <Shelter> }`
Errors: `404 hold_not_found`, `409 {"error": "hold_not_active", "status": "expired"}`

### `DELETE /api/holds/<id>`
Cancels the hold and gives the bed back.
→ `200 { "status": "cancelled", "hold": <Hold>, "shelter": <Shelter> }`
Errors: `404 hold_not_found`, `409 hold_not_active`

## Staff portal

Each shelter has a private staff key (24+ random URL-safe characters, stored only as a SHA-256
hash). The coordinator hands out `https://<base>/staff/<shelter_id>#key=<key>`; the page saves
the key and sends it as **`X-Staff-Key`**. While dev tools are on, `X-Admin-Key` works too.

Every endpoint: `404 shelter_not_found` for an unknown shelter, `403 invalid_staff_key` without a
valid key, `429 rate_limited` over 60 requests a minute per shelter. Every change is logged as an
event with `source: "staff"`, refreshes freshness, and is broadcast as `shelter_update`.

Changes return a **StaffChange**:
```json
{ "status": "applied", "delta": 1, "event_id": 4190, "open_beds": 4, "shelter": <Shelter> }
```
`event_id` is the logged event (pass it to revert to undo the change).

| Endpoint | Body | Notes |
|---|---|---|
| `GET /api/staff/<id>` | | `{ "shelter", "holds": [<Hold>], "events": [<Event>] (last 30), "tags": [<TagLink>], "revert_window_minutes": 60 }` |
| `POST /api/staff/<id>/count` | `{"open_beds": 4}` | Exact count, 0 to capacity (any if capacity is 0). `400 invalid_count` |
| `POST /api/staff/<id>/adjust` | `{"delta": 1}` | `1` or `-1` only. `400 invalid_delta`, `409 at_capacity` |
| `POST /api/staff/<id>/full` | | Sets 0 |
| `POST /api/staff/<id>/open` | `{"open_beds": 2}` | Reopen with at least 1 bed; also sets `accepting: true` |
| `POST /api/staff/<id>/events/<event_id>/revert` | | Reverses a tap/sms/staff change from the last 60 min, once. `status: "reverted"`, plus `reverted_event_id`. `404 event_not_found`, `409 already_reverted`, `409 cannot_revert_a_revert`, `409 not_revertable` (holds, arrivals, expiries), `409 revert_window_passed`, `409 nothing_to_revert` |
| `PATCH /api/staff/<id>/settings` | `{"pets_ok", "accepting", "staff_phone", "capacity"}` (any subset) | `status: "saved"`. `staff_phone` is what staff SMS updates match on; `""` clears it. `400 invalid_phone` (needs 10 digits), `400 not_allowed_for_dv`, `409 phone_in_use`, `400 no_settings` |
| `POST /api/staff/<id>/tags/rotate` | `{"action": "freed"}` or `{"action": "all"}` | New secret(s); the old link stops working at once. `{ "status": "rotated", "rotated": [...], "tags": [<TagLink>] }`. Not logged as an event |
| `DELETE /api/staff/<id>/holds/<hold_id>` | | The person never arrived: cancels the hold, gives the bed back. `status: "released"`, plus `hold`. `404 hold_not_found`, `409 hold_not_active` |

**TagLink:** `{ "action": "freed", "label": "Bed freed (+1)", "path": "/t/shelter-01/freed?k=…",
"url": "https://luminestbc.tech/t/shelter-01/freed?k=…", "last_tap_at": null, "minutes_since_tap": null }`.
`url` uses `TAG_BASE_URL`; `path` and `url` are `null` until the tag is set up.

DV shelters: the staff portal shows the same DV-safe Shelter object (no address, coordinates or
staff phone) and refuses a staff phone.

## Admin / test hub (dev tools only)

Only when `DEV_TOOLS_ENABLED=true` (otherwise `404 not_found`). Needs **`X-Admin-Key`** equal to
`ADMIN_KEY` (`403 admin_key_not_set` / `403 invalid_admin_key`). Rate limited like the staff portal.

| Endpoint | Body | Response |
|---|---|---|
| `GET /api/admin/shelters` | | `{ "shelters": [ <Shelter> + "has_staff_key" + "tags": [<TagLink>] ] }` |
| `POST /api/admin/reset-demo` | | Same as `scripts/reset_demo.py`. `{ "status": "reset", "shelters": 36, "holds_cancelled": 0, "lines": [...] }` |
| `POST /api/admin/expire-holds` | | Expires every active hold now. `{ "status": "expired", "expired": 2 }` |
| `POST /api/admin/shelters/<id>/stale` | | Sets `last_updated_at` to 4 hours ago. `{ "status": "stale", "shelter": <Shelter> }` |
| `POST /api/dev/voice` | `{"transcript": "Any women's beds near Surrey?"}` | Runs the real call pipeline (see below) |
| `POST /api/dev/sms` | `{"from": "+16045550101", "body": "3 beds open"}` | Same handler as `/twilio/sms`, no signature check. `{ "reply", "changed", "delta", "shelter" }` |

`POST /api/dev/voice` response:
```json
{ "request": { "gender": "woman", "area_text": "near Surrey tonight", "...": "..." },
  "area": "Surrey Whalley",
  "matches": [ { "id": "shelter-20", "name": "...", "open_beds": 1, "is_dv": false, "score": 0.39, "distance_km": 0.2 } ],
  "lines": [ { "kind": "greeting", "text": "...", "audio_url": "/audio/<id>.mp3" },
             { "kind": "filler", "...": "..." }, { "kind": "answer", "...": "..." } ],
  "voice": "elevenlabs", "extractor": "keywords",
  "timings_ms": { "gemini": 1, "ranking": 5, "tts": 1064, "total": 1070 } }
```
`audio_url` is `null` when ElevenLabs isn't available (a real call would use Twilio's `<Say>`).
`extractor` is `gemini` when `GEMINI_API_KEY` is set, else the keyword fallback. Transcripts are
never stored or logged.

## Socket.IO

Connect to the backend origin (same origin in dev). The server sends one event:

### `shelter_update`
The payload is a full **Shelter object** (same shape as above, DV rules applied). It is sent
after any committed change: taps, undo, texts, staff portal changes, holds, cancels, arrivals,
expiries and admin resets.
```json
{ "id": "shelter-02", "open_beds": 0, "is_full": true, "freshness": "green", "...": "..." }
```
Clients replace their copy of that shelter by `id`.

## Health and stubs

| Endpoint | Status |
|---|---|
| `GET /health` | `200 {"ok": true}` |
| `GET /api/stats`, `GET /api/stats/<anything>` | `501 {"error": "not_implemented", "tier": 3}` |
| `GET /api/weather-layer` | `501 {"error": "not_implemented", "tier": 3}` |

## Twilio webhooks (Communications)

All of these return TwiML (`text/xml`). When `TWILIO_AUTH_TOKEN` is set, `/twilio/*` requests
must carry a valid `X-Twilio-Signature`, checked against `BACKEND_PUBLIC_URL` + path (not
`request.url`, which says `http://localhost` behind a tunnel or proxy).

| Endpoint | What it does |
|---|---|
| `POST /twilio/voice` | Greeting + `<Gather input="speech">` |
| `POST /twilio/voice/heard` | Keeps the transcript in memory by `CallSid`, replies with the filler line + `<Redirect>` |
| `POST /twilio/voice/answer` | Gemini extraction → matcher → templates; speaks the top 2 matches (DV: phone only) |
| `GET /audio/<id>.mp3` | ElevenLabs audio. Cached by exact text: fixed phrases are generated at startup and kept; answers expire after 30 min. Links use `BACKEND_PUBLIC_URL` |
| `POST /twilio/sms` | Staff text from a shelter's `staff_phone` → bed change (`source: "sms"`) and a reply |
