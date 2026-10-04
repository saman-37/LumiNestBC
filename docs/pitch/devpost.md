# LuminestBC: Devpost draft

**Find the lights still on.** A live shelter-bed network for Metro Vancouver.

## Inspiration

It's 11pm. An outreach worker is on a sidewalk with someone who needs a bed tonight.
They start phoning shelters, one by one. Most are full. Some don't pick up. The list
they're checking was last updated at 7:30pm. [BC211's shelter list](https://bc.211.ca/shelter-lists/)
updates twice a day, Monday to Friday. Nothing changes overnight or on weekends.

Cities have tried live shelter-bed apps before. Los Angeles built one, and a
[2023 city audit](https://laist.com/news/housing-homelessness/finding-a-shelter-bed-in-la-isnt-easy-la-city-controller-releases-audit)
found it had [inaccurate data and few shelters using it](https://www.yahoo.com/news/woefully-inadequate-why-hard-shelter-221042528.html).
The problem isn't the map, it's keeping the counts updated. We made updating take one tap.

## What it does

- **Tap Board.** Each shelter's front desk gets three NFC tags: *Bed freed* (+1),
  *Bed filled* (−1) and *We're full* (0). Staff tap a phone on a tag and the count
  changes. No app, no login. Each tag is a plain URL. A 10-second Undo fixes mistaps.
- **Live map.** Outreach workers see a dark map where shelters with open beds glow.
  Counts update instantly on every open screen. Filters cover women only, youth,
  families, pets, accessible and couples.
- **Freshness.** Every shelter shows how long ago staff confirmed its count: green under
  an hour, amber up to three hours, red after that. A worker knows how much to trust
  a number before they walk someone there.
- **Holds with a countdown.** A worker can hold a bed for 60 minutes while they get
  there. The page counts down. If they don't arrive, the bed goes back automatically.
  If two workers want the last bed at once, only one gets it. The other is told right away.
- **Arrival tag.** A fourth tag by the door. Staff tap it when the person arrives, and the
  hold is confirmed.
- **Staff dashboard.** Shelter staff see their count, active holds and recent changes.
- **Voice line (planned).** People without smartphones call a number and say what they
  need. We turn their words into a search, rank real open beds and read back the top two.
  The greeting works today. Speech understanding and answers are planned.
- **DV shelters never show a location.** Domestic violence shelters have no pin, no
  address and no staff phone anywhere in the app or the API. They show only
  "DV bed available: call [phone]".
- **Nothing stored about people being sheltered.** No names, no case notes. A hold keeps
  only the worker's name and org. The voice line won't ask for a name and won't store
  numbers, transcripts or recordings.

## How we built it

- **Frontend:** React, Vite and TypeScript as a PWA, styled with Tailwind, mapped with
  Leaflet. Hosted on Vercel. The tag page, map, hold page and staff page are separate screens.
- **Backend:** Flask with Flask-SocketIO, run by gunicorn with one worker on Render.
  Every change pushes a `shelter_update` event to all open screens.
- **Database:** PostgreSQL with TimescaleDB on Tiger Data. Every bed change is logged
  in an `availability_events` hypertable.
- **One door for bed changes.** Every change goes through one function, `change_beds()`.
  It locks the shelter row, never goes below zero (a database check backs this up) and
  always writes a log row.
- **One door out.** Every shelter leaving the server goes through `public_shelter()`.
  That's where DV address, coordinates and staff phone are removed.
- **Safe taps.** Each tag URL carries a secret. Each tap carries a one-time ID, so a retry
  on bad signal doesn't count twice. The same tag tapped again within 5 seconds is ignored.
  Opening a link changes nothing; only the page's POST does.
- **Racing holds.** The hold request locks the shelter row before checking for a bed.
  One worker gets the bed; the other gets "just taken".
- **Expiry job.** Every 60 seconds the server expires late holds and gives the beds back.
- **Voice line design (planned).** Twilio takes the call. Gemini only turns speech into
  JSON (who needs a bed, roughly where). Plain Python filters and ranks real beds by
  distance plus staleness. Replies come from fixed templates, spoken with ElevenLabs.
  The matcher is written and tested, and the templates are written; the Twilio, Gemini and ElevenLabs
  calls are not wired yet.
- **Tests:** pytest covers shelters, tags, holds and the matcher.

## Challenges

- **Making updates effortless.** Most bed apps fail on data entry, not on maps. We
  designed backwards from a busy front desk: one tap, no login, instant undo.
- **Taps in the real world.** Phones retry on bad signal and people double-tap. We needed
  one-time tap IDs and a short cooldown so the count stays honest.
- **The last bed.** Two workers can hit "hold" in the same second. Row locks in one
  transaction made sure only one wins.
- **Honest freshness.** Holds and expiries change the count, but they don't prove anyone
  checked the beds. Only staff actions reset the freshness clock.
- **Privacy by default.** Hiding DV locations in the UI isn't enough. We strip them on the
  server, in one place, so no API call or socket event can leak them.

## Accomplishments

- A shelter count that updates from a cheap NFC sticker and a phone, with no app install.
- Live updates on every screen within moments of a tap.
- Holds that can't double-book the last bed.
- DV safety and "store nothing about people" enforced in code, not just policy.

## What we learned

- The hard part of a bed registry is keeping it current. The tech is the easy part.
- A number without an age is risky. Showing freshness matters as much as showing beds.
- Small rules in one place (`change_beds()`, `public_shelter()`) are easier to trust than
  checks spread across the code.
- AI is useful for turning speech into structured data. Decisions about real people's
  beds should stay in plain, testable code.

## What's next

- **Voice line (planned):** finish Gemini extraction, ranking replies and ElevenLabs audio.
- **Staff SMS (planned):** text "2 beds open" to update a count.
- **Stale-shelter nudges (planned):** text a shelter whose count is over three hours old.
- **Staff dashboard login (planned):** today it has no auth; it needs one before real use.
- **Trends and weather layer (planned):** bed trends from the event log and a cold, heat
  and rain overlay.
- **Pilot:** load real BC211 shelter data, put tags in a few shelters and test with
  outreach teams.

## Built with

React · Vite · TypeScript · Tailwind CSS · Leaflet · Socket.IO · Flask · Flask-SocketIO ·
gunicorn · PostgreSQL · TimescaleDB · Tiger Data · Render · Vercel · NFC tags · pytest

Planned: Twilio · Gemini · ElevenLabs
