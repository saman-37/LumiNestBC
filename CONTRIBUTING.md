# Contributing to LuminestBC

24 hours, four people, one repo. Each person owns one area so we can work in parallel
without stepping on each other.

## Who owns what

| Area | Owner | Folders | Branch prefix |
|---|---|---|---|
| Frontend | Person 1 | `frontend/` | `frontend/...` |
| Backend | Person 2 | `backend/app/` (except `comms/`), `backend/sql/`, `backend/tests/`, `render.yaml`, `docker-compose.yml` | `backend/...` |
| Communications | Person 3 | `backend/app/comms/` | `comms/...` |
| Design / data / pitch | Person 4 | `scripts/`, `data/`, `satellite/`, `docs/`, pitch | `data/...` |

Each frontend screen has its own file in `frontend/src/pages/` so two people can work on
different screens without merge conflicts.

**Shared contract:** [docs/api.md](docs/api.md). If you change an endpoint or the
`shelter_update` payload, update `docs/api.md` and `frontend/src/lib/types.ts` in the same
PR and tell the team.

## Workflow

1. **Pull main before starting:** `git checkout main && git pull`
2. Branch: `git checkout -b frontend/hold-countdown` (use your area's prefix)
3. **Small PRs.** Merge often; a PR that touches one area merges fastest.
4. Before pushing: backend runs `pytest`; frontend runs `npm run build`.
5. **Never commit `.env`** or `data/tag_links.csv` (both contain secrets and are git-ignored).

## Scope rule

**Nothing from Tier 3 until Tier 1 works on two devices.** That means tap a tag on one
phone and watch the count change on the other phone's map, then hold a bed and confirm
the arrival.

- **Tier 1 (wired now):** map, filters, freshness, tag taps with undo, holds, arrival, staff dashboard, live updates.
- **Tier 2 (stubbed):** voice line (Twilio + Gemini + ElevenLabs), staff SMS, stale-shelter nudges.
- **Tier 3 (501 placeholders):** stats, weather layer, `satellite/`.

## Non-negotiables

- Nothing is stored about the people being sheltered. Holds store only the worker's name and org.
- DV shelters never expose an address or coordinates through any API or socket event. Everything goes through `public_shelter()` in `backend/app/availability.py`.
- GET requests never change data. Tag URLs open a page, and only that page's POST changes data.
