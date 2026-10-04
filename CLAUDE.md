# LuminestBC — live shelter-bed network (StormHacks 2026)

Read these before any task:
- CONTRIBUTING.md: who owns which folders, workflow, scope rules
- docs/api.md: the API contract (fixed; never change it without asking)
- docs/architecture.md: how the parts fit and the rules the code enforces

## Rules
- Only edit folders owned by the area named in your task (see CONTRIBUTING.md).
- If a change touches the API, stop and ask. docs/api.md and
  frontend/src/lib/types.ts must change together in the same PR.
- All bed changes go through change_beds(); every shelter leaving the server
  goes through public_shelter(). Never bypass either.
- DV shelters never expose address, coordinates or staff phone anywhere.
- Store nothing about people being sheltered. Holds store only worker name and org.
- GET never changes data.
- Gemini only extracts JSON. Filtering, ranking and decisions are plain Python;
  spoken replies come from templates.
- Secrets come from .env only. Never commit .env or data/tag_links.csv.
- Tier 1 first. No Tier 3 until Tier 1 works on two devices.
- Before finishing: backend runs pytest, frontend runs npm run build.
  Run the code and confirm it works before saying a task is done.
- Keep changes small and focused on the task given.