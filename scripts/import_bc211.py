"""Import the BC211 shelter list PDFs (used with permission from BC211) into the database.

    python scripts/import_bc211.py                 # parse data/bc211/*.pdf -> CSV -> geocode -> import
    python scripts/import_bc211.py --parse-only    # just write data/bc211_shelters.csv for review
    python scripts/import_bc211.py --from-csv      # import the (reviewed / hand-fixed) CSV, no parsing
    python scripts/import_bc211.py --dry-run       # parse + match and show what would change

1. Parse. Every table in every PDF is read with pdfplumber. Headers are recognised at runtime
   (City, Shelter, Last Update, Beds, Gender, Age Range, Note, Intake Info, Accessibility, ...),
   rows that wrap across lines or pages are joined back together, and the cleaned result goes to
   data/bc211_shelters.csv. Re-parsing keeps ids and coordinates already in that CSV, so fixes
   made by hand there survive.
2. Map. Flags (women_only, youth, families, couples, pets_ok, accessible) are only set when the
   text clearly says so. Note / Intake Info / Accessibility text is kept in shelters.notes.
   The PDF's bed count is never used as availability: new shelters start at 0 beds with an old
   last_updated_at ("unconfirmed") until staff update them. It's used as capacity only when the
   column looks like a total. Phone numbers are never imported (staff_phone drives SMS updates).
3. Geocode. Missing coordinates are looked up on OpenStreetMap Nominatim (1 request per second,
   descriptive User-Agent, bounded to British Columbia), by address, else by name + city.
   Results, including misses, are cached in data/geocode_cache.json. Rows that can't be found are
   still imported, without a map pin, and listed under "needs coordinates": add lat/lng to the
   CSV and re-run with --from-csv.
4. Safety. Any row that looks like a domestic-violence / transition house / safe house is skipped
   entirely (never written to the CSV, never geocoded). Rows are upserted by normalised name +
   city; existing shelters (data/shelters.csv, open data) are matched and updated, not doubled.
   The fictional demo shelters are never touched.
"""
import argparse
import csv
import json
import re
import ssl
import time
from collections import Counter
import urllib.parse
import urllib.request
from pathlib import Path

from _common import ROOT, connect
from import_open_data import DV_PATTERN as OPEN_DATA_DV_PATTERN
from import_shelters import NOMINATIM_URL, USER_AGENT

SOURCE = "bc211"
PDF_DIR = ROOT / "data" / "bc211"
CSV_PATH = ROOT / "data" / "bc211_shelters.csv"
CACHE_PATH = ROOT / "data" / "geocode_cache.json"
UNCONFIRMED_DAYS = 7
PROTECTED_IDS = {"shelter-20", "shelter-21"}  # fictional Surrey women's demo + DV demo (reset_demo, voice rehearsal)
BC_VIEWBOX = "-139.06,60.00,-114.03,48.20"  # lon/lat box around British Columbia
FLAGS = ("women_only", "youth", "families", "pets_ok", "accessible", "couples")
CSV_FIELDS = ("id", "name", "city", "address", "lat", "lng", "capacity", *FLAGS, "notes",
              "bc211_gender", "bc211_age_range", "bc211_beds", "bc211_last_update", "source_pdf")

# Our field -> header names we recognise (after norm(): lower case, a-z0-9_).
HEADERS = {
    "city": ("city", "community", "municipality", "location", "town"),
    "name": ("shelter", "shelter_name", "name", "facility", "program", "program_name", "agency"),
    "last_update": ("last_update", "last_updated", "updated", "update", "date_updated", "date"),
    "beds": ("beds", "bed", "num_beds", "no_of_beds", "beds_available", "available_beds",
             "total_beds", "capacity", "spaces"),
    "gender": ("gender", "genders", "sex", "population", "serves", "clients"),
    "age": ("age_range", "age", "ages", "age_group"),
    "note": ("note", "notes", "comments", "comment", "details"),
    "intake": ("intake_info", "intake", "intake_information", "intake_details", "how_to_access", "access"),
    "accessibility": ("accessibility", "accessible", "wheelchair", "wheelchair_accessible"),
    "address": ("address", "street_address", "location_address", "street"),
    "phone": ("phone", "telephone", "phone_number", "contact"),  # recognised so it's never mistaken; never imported
}

DV_PATTERN = re.compile(
    OPEN_DATA_DV_PATTERN.pattern + r"|transition home|safe ?home|women fleeing|violence against women|\bvaw\b",
    re.I)
NOT_DV = re.compile(r"substance (?:use|abuse|misuse)", re.I)  # "substance abuse" isn't a DV signal
NEGATION = re.compile(r"\b(?:no|not|non|without|never|cannot|can't|unable|except|excluding)\b", re.I)
NEGATED_AFTER = re.compile(r"^\W*(?:are\s+|is\s+)?(?:not|no)\b", re.I)


# ---------------------------------------------------------------- text helpers

def norm(header: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (header or "").strip().lower()).strip("_")


def clean(cell) -> str:
    """One cell as a single line (pdfplumber keeps the line breaks of wrapped text)."""
    return re.sub(r"\s+", " ", str(cell or "")).strip()


def says(text: str, pattern: str) -> bool:
    """True when the pattern appears and that mention isn't negated ("no pets", "pets not allowed")."""
    for m in re.finditer(pattern, text or "", re.I):
        clause = re.split(r"[.;,:()/]", text[max(0, m.start() - 30):m.start()])[-1]
        if NEGATION.search(clause) or NEGATED_AFTER.search(text[m.end():m.end() + 25]):
            continue
        return True
    return False


STOPWORDS = {"the", "shelter", "shelters", "and", "a", "an", "of", "for", "at"}


def name_key(name: str) -> str:
    """Lower case, '&' -> 'and', no punctuation, without words like 'shelter' and 'the'."""
    text = (name or "").lower().replace("&", " and ").replace("'", "").replace("’", "")
    words = re.sub(r"[^a-z0-9]+", " ", text).split()
    return " ".join(w for w in words if w not in STOPWORDS)


def name_keys(name: str) -> set[str]:
    """The full key, plus the key without any (parenthetical) or ' - suffix',
    e.g. 'SPUDS (Previously ...)', 'Belkin House - Women And Children's Shelter'."""
    plain = re.sub(r"\(.*?\)", " ", name or "")
    keys = {name_key(name), name_key(plain), name_key(re.split(r"\s[-\u2013\u2014]\s", plain)[0])}
    return {k for k in keys if k}


def city_key(city: str | None) -> str:
    return re.sub(r"[^a-z]+", " ", (city or "").lower()).strip()


def city_from_address(address: str | None) -> str:
    """'467 Alexander Street, Vancouver, BC' -> 'Vancouver'."""
    parts = [p.strip() for p in (address or "").split(",") if p.strip()]
    had_province = False
    while parts and re.fullmatch(r"canada|(?:bc|british columbia)?\s*(?:v\d\w\s?\d\w\d)?", parts[-1], re.I):
        parts.pop()  # drop "BC", "Canada" and postal codes from the end
        had_province = True
    return parts[-1] if len(parts) >= 2 or (parts and had_province) else ""


# ---------------------------------------------------------------- flags

def infer_flags(rec: dict) -> dict:
    """Only set a flag when the text clearly says so; everything else stays False."""
    name, gender, age = rec.get("name", ""), rec.get("gender", ""), rec.get("age", "")
    note, intake, access = rec.get("note", ""), rec.get("intake", ""), rec.get("accessibility", "")
    who = f"{gender}. {name}"
    everything = f"{gender}. {age}. {name}. {note}. {intake}"

    women = says(who, r"\b(?:women|woman|female|ladies|girls)\b") and not says(
        gender, r"\b(?:men|man|male|males|co-?ed|mixed|all genders?|any gender|all|everyone|adults?)\b")

    youth = says(f"{gender}. {age}. {name}", r"\byouth\b|\byoung (?:people|adults|persons)\b")
    for low, high in re.findall(r"\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b", age):
        if int(high) < 25 and int(low) < int(high):
            youth = True
    under = re.search(r"\b(?:under|below|up to)\s*(\d{1,2})\b", age, re.I)
    if under and int(under.group(1)) <= 25:
        youth = True

    families = says(everything, r"\bfamil(?:y|ies)\b"
                                r"|\b(?:women|woman|mothers?|moms?|parents?|couples?|adults?)\s*(?:and|&|\+|with)\s*(?:their\s+)?(?:children|kids|child|dependents)\b"
                                r"|\b(?:children|kids)\s+(?:are\s+)?(?:welcome|accepted|allowed|ok)\b")
    couples = says(everything, r"\bcouples?\b")
    pets = not re.search(r"service (?:animals?|dogs?) only", everything, re.I) and says(
        f"{everything}. {access}",
        r"\bpets?[- ]friendly\b|\bpets?\s*:\s*yes\b"
        r"|\b(?:pets?|dogs?|cats?|animals?)\s+(?:are\s+|is\s+)?(?:welcome|allowed|accepted|ok|okay|permitted)\b"
        r"|\b(?:accepts?|allows?|welcomes?)\s+(?:pets?|dogs?|cats?|animals?)\b")
    accessible = (
        bool(re.fullmatch(r"(?:yes|y|accessible|fully accessible|wheelchair|wheelchair accessible)\.?", access.strip(), re.I))
        or (says(f"{access}. {note}", r"\bwheelchair[- ]accessible\b|\bfully accessible\b|\baccessible\b")
            and not re.search(r"\b(?:partial(?:ly)?|limited|partly|some|not)\b[\w\s-]{0,15}accessib", f"{access} {note}", re.I))
    )
    return {"women_only": women, "youth": youth, "families": families or (women and says(who, r"\bchildren\b")),
            "pets_ok": pets, "accessible": accessible, "couples": couples}


def is_dv(rec: dict) -> bool:
    text = NOT_DV.sub(" ", " ".join(rec.get(k, "") for k in ("name", "gender", "note", "intake")))
    return bool(DV_PATTERN.search(text))


def notes_for(rec: dict) -> str | None:
    parts = [f"{label}: {rec[k]}" for k, label in (("note", "Note"), ("intake", "Intake"),
                                                    ("accessibility", "Accessibility")) if rec.get(k)]
    return " | ".join(parts) or None


# ---------------------------------------------------------------- parsing

def header_map(row: list[str]) -> dict[int, str] | None:
    """{column index: our field} when this row is a header row (has a name column + 2 others)."""
    found = {}
    for i, cell in enumerate(row):
        key = norm(cell)
        for field, names in HEADERS.items():
            if key in names and field not in found.values():
                found[i] = field
                break
    return found if "name" in found.values() and len(found) >= 3 else None


def page_tables(page) -> list[list[list[str]]]:
    """Tables drawn with ruling lines first; fall back to text alignment if there are none."""
    # A row cut off by the page break has no bottom ruling line; an explicit line just under
    # the last text closes it, so its top half isn't dropped (the rest is joined from the next page).
    bottom = max((c["bottom"] for c in page.chars), default=page.height - 2) + 1.5
    tables = page.extract_tables({"explicit_horizontal_lines": [min(bottom, page.height - 1)]})
    if not any(len(t) > 1 for t in tables):
        tables = page.extract_tables({"vertical_strategy": "text", "horizontal_strategy": "text"})
    return [[[clean(c) for c in row] for row in t] for t in tables if t]


def _glue(target: dict, fragment: dict, before: bool = False) -> None:
    for k, v in fragment.items():
        if v and k != "city":
            old = target.get(k, "")
            target[k] = f"{v} {old}".strip() if before else f"{old} {v}".strip()


def parse_pdf(path: Path, stats: dict) -> tuple[list[dict], dict]:
    """Rows of one PDF as dicts of our fields. Wrapped rows (also across pages) are joined.

    A wrapped line normally belongs to the row above. In tables without ruling lines, cells can
    be vertically centred, so a line that comes right after a gap (blank row) belongs to the
    row below instead.
    """
    import pdfplumber  # only the parse step needs it

    records, columns, raw_headers = [], None, {}
    current, city = None, ""
    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            tables = page_tables(page)
            if not tables:
                stats["skipped"].append(f"page {page_no}: no table found")
            for table in tables:
                pending, after_gap = [], False
                for row in table:
                    stats["rows_found"] += 1
                    found = header_map(row)
                    if found:
                        if columns:
                            stats["skip_reasons"]["repeated header"] += 1
                        columns = found
                        raw_headers = {field: row[i] for i, field in found.items()}
                        continue
                    if not any(row):
                        stats["skip_reasons"]["blank row"] += 1
                        after_gap = True
                        continue
                    if columns is None:
                        stats["skip_reasons"]["before any header (title / legend)"] += 1
                        continue
                    rec = {field: row[i] if i < len(row) else "" for i, field in columns.items()}
                    filled = {k for k, v in rec.items() if v}
                    if filled == {"city"}:  # a city heading row ("Vancouver") above its shelters
                        city = rec["city"]
                        stats["skip_reasons"]["city heading"] += 1
                        continue
                    if rec.get("name") and filled & {"city", "last_update", "beds", "gender", "age"}:
                        city = rec.get("city") or city
                        current = {**rec, "city": city, "source_pdf": path.name, "_page": page_no}
                        for fragment in reversed(pending):
                            _glue(current, fragment, before=True)
                        pending, after_gap = [], False
                        records.append(current)
                        continue
                    stats["skip_reasons"]["wrapped line joined to its row"] += 1
                    if after_gap or current is None:
                        pending.append(rec)  # belongs to the next row
                    else:
                        _glue(current, rec)
                for fragment in pending:  # nothing came after: it was the last row's
                    if current is None:
                        stats["skip_reasons"]["wrapped line joined to its row"] -= 1
                        stats["skip_reasons"]["fragment with no row to join"] += 1
                    else:
                        _glue(current, fragment)
    if columns is None:
        stats["skipped"].append("no header row recognised (run with --debug to see the raw rows)")
    return records, raw_headers


def debug_dump(path: Path) -> None:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        for page_no, page in enumerate(pdf.pages, 1):
            for t, table in enumerate(page_tables(page)):
                print(f"--- {path.name} page {page_no} table {t + 1}")
                for row in table[:25]:
                    print("   ", row)


def bed_number(text: str) -> int | None:
    m = re.fullmatch(r"\D{0,12}?(\d{1,4})(?:\s*/\s*(\d{1,4}))?\b.*", text or "")
    if not m:
        return None
    return int(m.group(2) or m.group(1))  # "3/40" = 3 of 40: the total is the second number


def beds_are_totals(header: str, values: list[int | None]) -> tuple[bool, str]:
    h = norm(header)
    if re.search(r"avail|vacan|open|free", h):
        return False, f"column {header!r} is availability"
    if re.search(r"total|capacity", h):
        return True, f"column {header!r} is a total"
    nums = [v for v in values if v is not None]
    if not nums:
        return False, f"column {header!r} has no numbers"
    zeros = sum(1 for v in nums if v == 0) / len(nums)
    small = sorted(nums)[len(nums) // 2] < 5
    if zeros > 0.2 or small:
        return False, f"column {header!r} looks like availability ({zeros:.0%} zeros, median {sorted(nums)[len(nums) // 2]})"
    return True, f"column {header!r} looks like totals (median {sorted(nums)[len(nums) // 2]})"


def to_csv_row(rec: dict, use_beds: bool) -> dict:
    beds = bed_number(rec.get("beds", ""))
    flags = infer_flags(rec)
    return {
        "id": "", "name": rec["name"], "city": rec.get("city", ""), "address": rec.get("address", ""),
        "lat": "", "lng": "",
        "capacity": str(beds) if use_beds and beds and beds <= 1000 else "",
        **{k: "true" if v else "false" for k, v in flags.items()},
        "notes": notes_for(rec) or "",
        "bc211_gender": rec.get("gender", ""), "bc211_age_range": rec.get("age", ""),
        "bc211_beds": rec.get("beds", ""), "bc211_last_update": rec.get("last_update", ""),
        "source_pdf": rec["source_pdf"],
    }


def row_key(row: dict) -> tuple[str, str]:
    return name_key(row["name"]), city_key(row["city"])


def parse_all(pdf_dir: Path, csv_path: Path) -> list[dict]:
    pdfs = sorted(pdf_dir.glob("*.pdf")) + sorted(pdf_dir.glob("*.PDF"))
    if not pdfs:
        raise SystemExit(f"No PDFs in {pdf_dir}. Put the BC211 shelter list PDFs there first.")
    previous = {}
    if csv_path.exists():  # keep ids / coordinates / addresses from an earlier run or hand fixes
        with open(csv_path, newline="") as f:
            previous = {row_key(r): r for r in csv.DictReader(f)}

    rows, seen, dv_names, totals = [], {}, [], {"found": 0, "parsed": 0, "skipped": 0}
    print("parsing PDFs")
    for path in pdfs:
        stats = {"rows_found": 0, "skipped": [], "skip_reasons": Counter()}
        records, raw_headers = parse_pdf(path, stats)
        header = raw_headers.get("beds", "")
        use_beds, why = beds_are_totals(header, [bed_number(r.get("beds", "")) for r in records]) if header else (False, "no beds column")
        print(f"\n  {path.name}")
        print(f"    columns: {', '.join(f'{v!r}->{k}' for k, v in raw_headers.items()) or '(none recognised)'}")
        if "phone" in raw_headers:
            print(f"    note: {raw_headers['phone']!r} recognised but never imported")
        print(f"    capacity: {'used' if use_beds else 'not used'} ({why})")
        parsed = dv = dupes = 0
        for rec in records:
            if is_dv(rec):
                dv += 1
                dv_names.append(f"{rec['name']} ({rec.get('city') or 'no city'}, {path.name})")
                continue
            row = to_csv_row(rec, use_beds)
            key = row_key(row)
            if key in seen:  # the same shelter in two PDFs (or twice in one): fill gaps, keep one
                dupes += 1
                for k, v in row.items():
                    if v and not seen[key].get(k):
                        seen[key][k] = v
                continue
            for k in ("id", "lat", "lng", "address", "capacity"):
                old = previous.get(key, {}).get(k)
                if old and not row[k]:
                    row[k] = old
            seen[key] = row
            rows.append(row)
            parsed += 1
        reasons = dict(stats["skip_reasons"])
        if dv:
            reasons["domestic violence / transition / safe house (never imported)"] = dv
        if dupes:
            reasons["duplicate of a row already parsed"] = dupes
        skipped = sum(reasons.values())
        print(f"    table rows found {stats['rows_found']}, shelters parsed {parsed}, rows skipped {skipped}")
        for reason, n in reasons.items():
            print(f"      - {n} x {reason}")
        for line in stats["skipped"]:
            print(f"      ! {line}")
        totals["found"] += stats["rows_found"]
        totals["parsed"] += parsed
        totals["skipped"] += skipped

    write_csv(csv_path, rows)
    print(f"\nparsed {totals['parsed']} shelter(s) from {len(pdfs)} PDF(s) "
          f"({totals['found']} table rows, {totals['skipped']} skipped) -> {shown(csv_path)}")
    if dv_names:
        print(f"\nskipped {len(dv_names)} domestic violence / transition / safe house row(s) (not written anywhere):")
        for line in dv_names:
            print(f"  x {line}")
    return rows


def shown(path: Path) -> str:
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def write_csv(path: Path, rows: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows({k: r.get(k, "") for k in CSV_FIELDS} for r in rows)


# ---------------------------------------------------------------- geocoding

class Geocoder:
    """Nominatim, at most 1 request per second, bounded to BC, every answer cached on disk."""

    def __init__(self, cache_path: Path, retry_misses: bool):
        self.path = cache_path
        self.cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
        self.retry_misses = retry_misses
        self.last_request = 0.0
        self.requests = 0
        try:
            import certifi
            self.ssl = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            self.ssl = None

    def lookup(self, params: dict) -> dict | None:
        key = urllib.parse.urlencode(sorted(params.items()))
        if key in self.cache and (self.cache[key] is not None or not self.retry_misses):
            return self.cache[key]
        time.sleep(max(0.0, 1.0 - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        self.requests += 1
        query = urllib.parse.urlencode({**params, "format": "jsonv2", "limit": 1, "countrycodes": "ca",
                                        "viewbox": BC_VIEWBOX, "bounded": 1, "addressdetails": 1})
        request = urllib.request.Request(f"{NOMINATIM_URL}?{query}", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=15, context=self.ssl) as response:
                results = json.load(response)
        except OSError as e:
            print(f"    ! geocoding request failed ({e}); not cached, will retry next run")
            return None
        found = None
        if results:
            r, a = results[0], results[0].get("address", {})
            street = " ".join(x for x in (a.get("house_number"), a.get("road")) if x)
            town = a.get("city") or a.get("town") or a.get("village") or a.get("municipality") or ""
            found = {"lat": round(float(r["lat"]), 6), "lng": round(float(r["lon"]), 6),
                     "address": f"{street}, {town}, BC" if street and town else None,
                     "display_name": r.get("display_name")}
        self.cache[key] = found
        self.save()
        return found

    def save(self) -> None:
        self.path.write_text(json.dumps(self.cache, indent=1, sort_keys=True) + "\n")

    def locate(self, row: dict) -> tuple[dict | None, str]:
        """(result, how): by street address when we have one, else by name + city.
        A result outside the shelter's city is rejected (a name can match a place elsewhere)."""
        city = row["city"]
        in_city = lambda r: r if r and (not city or city_key(city) in city_key(r["display_name"])) else None  # noqa: E731
        if row["address"]:
            q = row["address"] if city_key(city) in city_key(row["address"]) else f"{row['address']}, {city}"
            found = in_city(self.lookup({"q": f"{q}, British Columbia, Canada"}))
            if found:
                return found, "address"
        name = re.sub(r"\(.*?\)", " ", row["name"]).strip()
        found = in_city(self.lookup({"q": f"{name}, {city}, British Columbia, Canada"}))
        if not found and city:
            found = in_city(self.lookup({"amenity": name, "city": city, "state": "British Columbia"}))
        return found, "name"


# ---------------------------------------------------------------- database

def shelter_number(shelter_id: str) -> int:
    m = re.fullmatch(r"shelter-(\d+)", shelter_id or "")
    return int(m.group(1)) if m else 0


def find_match(row: dict, existing: list[dict], taken: set[str]) -> dict | None:
    keys, city = name_keys(row["name"]), city_key(row["city"])
    for shelter in existing:
        if shelter["id"] in taken:
            continue
        their_city = city_key(city_from_address(shelter["address"]))
        if name_keys(shelter["name"]) & keys and (not city or not their_city or city == their_city):
            return shelter
    return None


def similar(row: dict, existing: list[dict]) -> list[dict]:
    """Same city, mostly the same words: not merged, only listed so a person can check."""
    words = set(name_key(row["name"]).split())
    out = []
    for s in existing:
        theirs = set(name_key(s["name"]).split())
        same_city = city_key(row["city"]) == city_key(city_from_address(s["address"]))
        if words and theirs and same_city and len(words & theirs) / len(words | theirs) >= 0.5:
            out.append(s)
    return out


def import_rows(rows: list[dict], args) -> None:
    summary = {"inserted": [], "matched": [], "updated_bc211": [], "needs_coordinates": [], "by_name": []}
    with connect() as conn:
        conn.execute("ALTER TABLE shelters ADD COLUMN IF NOT EXISTS notes TEXT")  # also in schema.sql
        shelters = conn.execute("SELECT id, name, address, lat, lng, capacity, source, is_dv FROM shelters").fetchall()
        by_id = {s["id"]: s for s in shelters}
        candidates = [s for s in shelters if s["id"] not in PROTECTED_IDS and not s["is_dv"]]
        csv_ids = [shelter_number(r["id"]) for r in rows]
        with open(ROOT / "data" / "shelters.csv", newline="") as f:
            curated_ids = [shelter_number(r["id"]) for r in csv.DictReader(f)]
        next_number = max([0, *map(shelter_number, by_id), *csv_ids, *curated_ids]) + 1

        # 1. Match every row to an existing shelter (by id from an earlier run, else by name + city).
        taken, plan = set(), []
        for row in rows:
            match = by_id.get(row["id"]) if row["id"] and row["id"] not in PROTECTED_IDS else None
            if match and match["is_dv"]:
                match = None
            match = match or find_match(row, candidates, taken)
            if match:
                taken.add(match["id"])
            plan.append((row, match))

        # 2. Coordinates for the rows that still need them.
        geocoder = None if args.no_geocode or args.dry_run else Geocoder(args.cache, args.retry_geocode)
        if geocoder:
            todo = [(r, m) for r, m in plan if not (r["lat"] and r["lng"]) and not (m and m["lat"] is not None)]
            if todo:
                print(f"\ngeocoding {len(todo)} shelter(s) (cached answers are instant; new ones 1 per second)")
            for row, _ in todo:
                found, how = geocoder.locate(row)
                if found:
                    row["lat"], row["lng"] = str(found["lat"]), str(found["lng"])
                    if not row["address"] and found["address"]:
                        row["address"] = found["address"]
                    if how == "name":
                        summary["by_name"].append(f"{row['name']} ({row['city']}) -> {found['display_name']}")
            print(f"  {geocoder.requests} request(s) sent to Nominatim")

        # 3. Write.
        for row, match in plan:
            flags = {k: row[k].strip().lower() == "true" for k in FLAGS}
            capacity = int(row["capacity"]) if row["capacity"].strip().isdigit() else 0
            lat = float(row["lat"]) if row["lat"] else None
            lng = float(row["lng"]) if row["lng"] else None
            # No street address: store "City, BC" so the city is still known (shown, and used to
            # match on re-runs). The CSV keeps it blank, so it's never geocoded to the city centre.
            address = row["address"] or None
            if row["city"] and city_key(row["city"]) not in city_key(address):
                address = f"{address}, {row['city']}, BC" if address else f"{row['city']}, BC"
            notes = row["notes"] or None
            if match:
                row["id"] = match["id"]
                if match["source"] == SOURCE:  # our own earlier import: BC211 is the authority
                    sets = {**flags, "notes": notes, "name": row["name"]}
                    if row["address"]:
                        sets["address"] = address
                    summary["updated_bc211"].append(match["id"])
                else:  # a curated / open-data shelter: only add what BC211 knows that we don't
                    sets = {"notes": notes}
                    flag_sql = ", ".join(f"{k} = {k} OR %({k})s" for k in FLAGS)
                    if not args.dry_run:
                        conn.execute(f"UPDATE shelters SET {flag_sql} WHERE id = %(id)s", {**flags, "id": match["id"]})
                    summary["matched"].append(f"{row['name']} ({row['city'] or '?'}) = {match['id']} {match['name']}")
                if capacity and not match["capacity"]:
                    sets["capacity"] = capacity
                if match["lat"] is None and lat is not None:
                    sets.update(lat=lat, lng=lng)
                if not match["address"] and address:
                    sets["address"] = address
                if not args.dry_run:
                    conn.execute(f"UPDATE shelters SET {', '.join(f'{k} = %({k})s' for k in sets)} WHERE id = %(id)s",
                                 {**sets, "id": match["id"]})
                has_pin = match["lat"] is not None or lat is not None
            else:
                row["id"] = f"shelter-{next_number:02d}"
                next_number += 1
                if not args.dry_run:
                    conn.execute(
                        """
                        INSERT INTO shelters (id, name, address, lat, lng, capacity, open_beds, is_full,
                            women_only, youth, families, pets_ok, accessible, couples, is_dv, dv_phone,
                            staff_phone, notes, source, last_updated_at)
                        VALUES (%(id)s, %(name)s, %(address)s, %(lat)s, %(lng)s, %(capacity)s, 0, TRUE,
                            %(women_only)s, %(youth)s, %(families)s, %(pets_ok)s, %(accessible)s, %(couples)s,
                            FALSE, NULL, NULL, %(notes)s, %(source)s,
                            now() - %(days)s::int * interval '1 day')
                        """,
                        {**flags, "id": row["id"], "name": row["name"], "address": address, "lat": lat, "lng": lng,
                         "capacity": capacity, "notes": notes, "source": SOURCE, "days": UNCONFIRMED_DAYS},
                    )
                summary["inserted"].append(row)
                for s in similar(row, candidates):
                    print(f"  ? {row['id']} {row['name']} ({row['city']}) looks like {s['id']} {s['name']}: not merged, check")
                has_pin = lat is not None
            if not has_pin:
                summary["needs_coordinates"].append(f"{row['id']} {row['name']} ({row['city'] or 'no city'})")
        if args.dry_run:
            conn.rollback()

    if not args.dry_run:
        write_csv(args.csv, rows)  # ids, coordinates and looked-up addresses, for review and re-runs

    prefix = "dry run: would have " if args.dry_run else ""
    print(f"\n{prefix}matched {len(summary['matched'])} existing shelter(s):")
    for line in summary["matched"]:
        print(f"  = {line}")
    print(f"{prefix}inserted {len(summary['inserted'])} new shelter(s)"
          + (f" ({summary['inserted'][0]['id']} .. {summary['inserted'][-1]['id']})" if summary["inserted"] else ""))
    print(f"{prefix}updated {len(summary['updated_bc211'])} shelter(s) from an earlier BC211 import")
    if summary["by_name"]:
        print(f"\n{len(summary['by_name'])} pin(s) found by name, not street address (worth a glance):")
        for line in summary["by_name"]:
            print(f"  ~ {line}")
    if summary["needs_coordinates"]:
        print(f"\nneeds coordinates: {len(summary['needs_coordinates'])} shelter(s) have no map pin yet"
              f" (add lat/lng in {shown(args.csv)} and re-run with --from-csv):")
        for line in summary["needs_coordinates"]:
            print(f"  ! {line}")
    if summary["inserted"] and not args.dry_run:
        print("\nNext: python scripts/generate_tag_links.py  (tags + staff links for the new shelters)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--parse-only", action="store_true", help="parse the PDFs and write the CSV; no database")
    parser.add_argument("--from-csv", action="store_true", help="skip parsing; import the existing CSV")
    parser.add_argument("--dry-run", action="store_true", help="parse and match, show what would change; write nothing")
    parser.add_argument("--no-geocode", action="store_true", help="don't look up missing coordinates")
    parser.add_argument("--retry-geocode", action="store_true", help="retry lookups that failed (cached misses)")
    parser.add_argument("--debug", action="store_true", help="print the raw table rows of every PDF and stop")
    parser.add_argument("--pdf-dir", type=Path, default=PDF_DIR)
    parser.add_argument("--csv", type=Path, default=CSV_PATH)
    parser.add_argument("--cache", type=Path, default=CACHE_PATH, help="geocode cache (JSON)")
    args = parser.parse_args()
    args.csv = args.csv.resolve()

    if args.debug:
        for path in sorted(args.pdf_dir.glob("*.pdf")):
            debug_dump(path)
        return
    if args.from_csv:
        if not args.csv.exists():
            raise SystemExit(f"{args.csv} doesn't exist yet. Run without --from-csv to parse the PDFs.")
        with open(args.csv, newline="") as f:
            rows = [{k: (r.get(k) or "").strip() for k in CSV_FIELDS} for r in csv.DictReader(f)]
        rows = [r for r in rows if r["name"] and not is_dv({"name": r["name"], "note": r["notes"]})]
        print(f"read {len(rows)} shelter(s) from {args.csv}")
    else:
        rows = parse_all(args.pdf_dir, args.csv)
    if not args.parse_only:
        import_rows(rows, args)


if __name__ == "__main__":
    main()
