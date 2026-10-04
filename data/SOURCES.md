# Where our shelter data comes from

| File / rows | Source | Licence / terms |
|---|---|---|
| `shelters_template.csv` | Written by the team. All rows are fictional examples. | Ours. |
| `shelters.csv` (rows `shelter-01` to `shelter-21`) | Compiled by the team from public listings of Metro Vancouver shelters (names and street addresses), geocoded with OpenStreetMap Nominatim. Two rows are fictional demo shelters. Counts are not real. | Facts only (names, public addresses). Coordinates © OpenStreetMap contributors, ODbL. |
| Rows with `source = 'vancouver_open_data'` | City of Vancouver Open Data Portal, dataset **"Homeless shelter locations"** (https://opendata.vancouver.ca), downloaded manually and loaded with `scripts/import_open_data.py`. Phone numbers are not imported. | Open Government Licence – Vancouver (https://opendata.vancouver.ca/pages/licence/). Attribution: "Contains information licensed under the Open Government Licence – Vancouver." |
| Rows with `source = 'bc211'`, `bc211_shelters.csv`, and the `notes` of matched shelters | **BC211 shelter list** PDFs (`data/bc211/`), used **with permission from BC211**. Permission granted by: _[name, role at BC211]_ on _[date]_. PDFs downloaded on: _[date]_. Parsed with `scripts/import_bc211.py`; names, cities, addresses, eligibility flags and Note / Intake / Accessibility text are imported. Phone numbers are not imported. | Used with BC211's permission (above); not an open licence. Ask BC211 before reusing it elsewhere. |
| `geocode_cache.json` | OpenStreetMap Nominatim answers for the BC211 import (1 request per second, cached so re-runs don't repeat requests). | Coordinates © OpenStreetMap contributors, ODbL. |
| `area_centres.json` | Approximate neighbourhood centres picked by the team. | Ours. |

**Not used:** scraping bc.211.ca. Its terms prohibit automated copying of the website, so we
only import the shelter list PDFs BC211 gave us permission to use (above).

**Availability counts are not BC211's.** BC211's PDFs include a bed count from their last update;
we never show it as availability. Every count in the app comes from shelter staff using
LuminestBC (or from `scripts/reset_demo.py` in demos).

**Never stored:** anything about people being sheltered, and any address or coordinates of a
domestic-violence / transition house / safe house. Both importers skip records that look like
one (the BC211 importer lists them in its summary and writes them nowhere).

Bed counts are never imported: every imported shelter starts at 0 beds and "unconfirmed" until
its staff update it (Tap Board, text, or the staff portal).
