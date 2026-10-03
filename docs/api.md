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
  "last_updated_at": "2026-10-03T23:04:35.902808+00:00",
  "minutes_since_update": 17,
  "freshness": "green"
}
```

- `freshness` is `green` under 60 min, `amber` from 60 to 180 min, and `red` over 180 min since staff last confirmed the count.
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

### `GET /api/shelters/<id>/holds`
Active holds, soonest expiry first. Used by the staff dashboard.
`{ "holds": [ <Hold>, ... ] }`

### `GET /api/shelters/<id>/events?limit=20`
Recent `availability_events`, newest first (`limit` is 1 to 100).
```json
{ "events": [ { "time": "2026-10-03T23:22:20+00:00", "delta": -1, "open_beds_after": 0, "source": "hold" } ] }
```
`source` is one of `tap`, `sms`, `hold`, `arrival`, `expiry` or `undo`.

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
Errors: `400 missing_fields`, `404 shelter_not_found`, **`409 {"error": "just_taken"}`** (no bed left).

### `GET /api/holds/<id>`
`{ "hold": <Hold>, "shelter": <Shelter> }`, or `404 hold_not_found`

### `POST /api/holds/<id>/arrive`
→ `200 { "status": "arrived", "hold": <Hold>, "shelter": <Shelter> }`
Errors: `404 hold_not_found`, `409 {"error": "hold_not_active", "status": "expired"}`

### `DELETE /api/holds/<id>`
Cancels the hold and gives the bed back.
→ `200 { "status": "cancelled", "hold": <Hold>, "shelter": <Shelter> }`
Errors: `404 hold_not_found`, `409 hold_not_active`

## Socket.IO

Connect to the backend origin (same origin in dev). The server sends one event:

### `shelter_update`
The payload is a full **Shelter object** (same shape as above, DV rules applied). It is sent
after any committed change: taps, undo, holds, cancels, arrivals and expiries.
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

## Twilio webhooks (Tier 2, Communications)

All of these return TwiML (`text/xml`).

| Endpoint | Now | Planned |
|---|---|---|
| `POST /twilio/voice` | **Works:** spoken greeting + `<Gather input="speech">` | same |
| `POST /twilio/voice/heard` | filler + redirect | `SpeechResult` → `gemini.extract_voice_request()` |
| `POST /twilio/voice/answer` | "still being set up" + hang up | `matcher.rank_shelters()` → speak top 2 |
| `GET /audio/<id>.mp3` | 501 | cached ElevenLabs audio |
| `POST /twilio/sms` | placeholder reply | `gemini.parse_staff_text()` → bed change (`source='sms'`) |
