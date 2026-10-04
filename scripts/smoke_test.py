"""End-to-end smoke test of a deployed LuminestBC (or the local stack). Prints a PASS/FAIL table.

    ADMIN_KEY=... python scripts/smoke_test.py \\
        --api https://luminestbc-api.onrender.com --web https://lumi-nest-bc.vercel.app

    python scripts/smoke_test.py --api http://localhost:8000 --web http://localhost:5173   # local

The admin key comes from the ADMIN_KEY environment variable (or .env), never a flag, so it
doesn't end up in shell history. Standard library only.

Checks: /health; /api/shelters (coordinates, no DV locations); the web app's SPA routes;
a real tag tap on the demo shelter, undo, and a hold made and cancelled; Socket.IO from the
web origin (CORS) receiving shelter_update; Twilio signature enforcement; the admin voice
simulator; Street View metadata if a Google key is set. The demo shelter's count is restored
afterwards (tap undone, hold cancelled); --reset-demo also re-applies the full demo state.
"""
import argparse
import json
import os
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    from _common import ROOT  # noqa: F401  loads .env (ADMIN_KEY, VITE_GOOGLE_MAPS_KEY) if present
except Exception:  # noqa: BLE001  works without the backend venv too
    pass

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

RESULTS: list[tuple[str, str, str]] = []


def record(status: str, name: str, detail: str = "") -> None:
    RESULTS.append((status, name, detail))
    print(f"  {status:<4} {name}{' · ' + detail if detail else ''}", flush=True)


def http(method: str, url: str, body=None, headers=None, timeout=20, raw=False):
    """(status, parsed JSON or text, response headers)."""
    data = None
    headers = dict(headers or {})
    if body is not None:
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            status, payload, rheaders = resp.status, resp.read(), resp.headers
    except urllib.error.HTTPError as err:
        status, payload, rheaders = err.code, err.read(), err.headers
    text = payload.decode("utf-8", "replace")
    if raw:
        return status, text, rheaders
    try:
        return status, json.loads(text), rheaders
    except ValueError:
        return status, text, rheaders


def check(name):
    """Run one check; any exception becomes a FAIL row instead of stopping the run."""
    def wrap(fn):
        def run(*args, **kwargs):
            try:
                return fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001
                record("FAIL", name, f"{type(exc).__name__}: {exc}")
                return None
        return run
    return wrap


# --- Checks ---------------------------------------------------------------------------

@check("API /health")
def health(api):
    status, body, _ = http("GET", f"{api}/health", timeout=60)  # a sleeping free instance takes ~50 s
    ok = status == 200 and isinstance(body, dict) and body.get("ok")
    record("PASS" if ok else "FAIL", "API /health", f"HTTP {status}")


@check("API /api/shelters")
def shelters(api):
    status, body, _ = http("GET", f"{api}/api/shelters")
    if status != 200:
        return record("FAIL", "API /api/shelters", f"HTTP {status}: {str(body)[:120]}")
    rows = body["shelters"]
    public = [s for s in rows if not s["is_dv"]]
    no_coords = [s["id"] for s in public if s["lat"] is None or s["lng"] is None]
    dv_leaks = [s["id"] for s in rows if s["is_dv"] and (s["address"] or s["lat"] is not None or s["lng"] is not None
                                                          or s.get("staff_phone") or s.get("public_phone"))]
    phones = sum(1 for s in public if s.get("public_phone"))
    record("PASS" if rows and not dv_leaks else "FAIL", "API /api/shelters",
           f"{len(rows)} shelters, {phones} with a public phone, DV locations exposed: {len(dv_leaks)}")
    record("PASS" if not no_coords else "WARN", "every public shelter has coordinates",
           "yes" if not no_coords else f"missing: {', '.join(no_coords)}")
    return rows


@check("web SPA routes")
def web_routes(web):
    for path in ("/", "/t/x/freed", "/staff/x", "/admin", "/hold/x"):
        status, text, headers = http("GET", f"{web}{path}", raw=True)
        ok = status == 200 and 'id="root"' in text
        record("PASS" if ok else "FAIL", f"web {path} loads", f"HTTP {status}")
    status, text, headers = http("GET", f"{web}/", raw=True)
    cache = headers.get("Cache-Control", "")
    record("PASS" if "no-cache" in cache or "max-age=0" in cache or web.startswith("http://localhost") else "WARN",
           "index.html not cached", cache or "(no Cache-Control)")


def admin_tags(api, key, shelter_id):
    status, body, _ = http("GET", f"{api}/api/admin/shelters", headers={"X-Admin-Key": key})
    if status != 200:
        raise RuntimeError(f"admin API HTTP {status} {body}")
    match = next((s for s in body["shelters"] if s["id"] == shelter_id), None)
    if match is None:
        raise RuntimeError(f"{shelter_id} not found")
    return match, {t["action"]: t for t in match["tags"]}


class SocketProbe:
    """Minimal Engine.IO v4 long-polling client: enough to prove CORS + a live shelter_update."""

    def __init__(self, api, origin):
        self.base = f"{api}/socket.io/?EIO=4&transport=polling"
        self.origin = origin
        self.sid = None
        self.events: list = []
        self.cors = None

    def _url(self):
        return f"{self.base}&t={uuid.uuid4().hex[:8]}" + (f"&sid={self.sid}" if self.sid else "")

    def connect(self):
        status, text, headers = http("GET", self._url(), headers={"Origin": self.origin}, raw=True)
        if status != 200 or not text.startswith("0"):
            raise RuntimeError(f"handshake HTTP {status}: {text[:120]}")
        self.cors = headers.get("Access-Control-Allow-Origin")
        self.sid = json.loads(text[1:])["sid"]
        http("POST", self._url(), body=b"40", headers={"Origin": self.origin, "Content-Type": "text/plain"}, raw=True)
        self.poll()  # namespace connect ack

    def poll(self, timeout=30):
        status, text, _ = http("GET", self._url(), headers={"Origin": self.origin}, raw=True, timeout=timeout)
        for packet in text.split("\x1e"):
            if packet == "2":  # ping -> pong
                http("POST", self._url(), body=b"3", headers={"Origin": self.origin, "Content-Type": "text/plain"}, raw=True)
            elif packet.startswith("42"):
                self.events.append(json.loads(packet[2:]))
        return status


@check("tag tap / undo / hold / Socket.IO")
def live_flow(api, web, key, shelter_id):
    shelter, tags = admin_tags(api, key, shelter_id)
    freed = tags.get("freed") or {}
    if not freed.get("path"):
        return record("FAIL", "tag tap", f"{shelter_id} has no 'freed' tag (run generate_tag_links.py)")
    secret = urllib.parse.parse_qs(urllib.parse.urlparse(freed["path"]).query)["k"][0]
    before = shelter["open_beds"]

    probe = SocketProbe(api, web)
    probe.connect()
    record("PASS" if probe.cors == web else "FAIL", "Socket.IO accepts the web origin (CORS)",
           f"Access-Control-Allow-Origin: {probe.cors}")
    poller = threading.Thread(target=probe.poll, daemon=True)
    poller.start()
    time.sleep(0.5)

    tap_id = f"smoke-{uuid.uuid4()}"
    status, tap, _ = http("POST", f"{api}/api/tags/{shelter_id}/freed", body={"k": secret, "tap_id": tap_id})
    ok = status == 200 and tap.get("status") == "applied" and tap["open_beds"] == before + 1
    record("PASS" if ok else "FAIL", "tag tap changes the count",
           f"{before} -> {tap.get('open_beds') if isinstance(tap, dict) else status} ({tap.get('status') if isinstance(tap, dict) else tap})")

    poller.join(timeout=25)
    updates = [e for e in probe.events if e and e[0] == "shelter_update" and e[1].get("id") == shelter_id]
    record("PASS" if updates else "FAIL", "Socket.IO receives shelter_update",
           f"open_beds={updates[0][1]['open_beds']}" if updates else "no event within 25 s")

    status, hold, _ = http("POST", f"{api}/api/holds",
                           body={"shelter_id": shelter_id, "worker_name": "Smoke test", "worker_org": "LuminestBC team"})
    if status == 201:
        hold_id = hold["hold"]["id"]
        c_status, cancel, _ = http("DELETE", f"{api}/api/holds/{hold_id}")
        record("PASS" if c_status == 200 else "FAIL", "hold created and cancelled", f"hold {hold_id[:8]}…, cancel HTTP {c_status}")
    else:
        record("FAIL", "hold created and cancelled", f"HTTP {status}: {hold}")

    status, undo, _ = http("POST", f"{api}/api/undo", body={"tap_id": tap_id})
    ok = status == 200 and undo.get("status") == "undone" and undo.get("open_beds") == before
    record("PASS" if ok else "FAIL", "undo restores the count", f"back to {undo.get('open_beds') if isinstance(undo, dict) else status}")


@check("Twilio signature")
def twilio_signature(api):
    status, _, _ = http("POST", f"{api}/twilio/voice", body=b"CallSid=CAsmoke",
                        headers={"Content-Type": "application/x-www-form-urlencoded"}, raw=True)
    local = "localhost" in api or "127.0.0.1" in api
    if status == 403:
        record("PASS", "POST /twilio/voice without a signature is rejected", "403")
    else:
        record("WARN" if local else "FAIL", "POST /twilio/voice without a signature is rejected",
               f"HTTP {status} (set TWILIO_AUTH_TOKEN{' on Render' if not local else ''})")


@check("voice simulator")
def voice(api, key):
    status, body, _ = http("POST", f"{api}/api/dev/voice", body={"transcript": "Any women's beds near Surrey tonight?"},
                           headers={"X-Admin-Key": key}, timeout=45)
    if status != 200:
        return record("FAIL", "admin voice simulator", f"HTTP {status}: {body}")
    answers = [line for line in body["lines"] if line["kind"] in ("answer", "offer")]
    record("PASS" if answers else "FAIL", "admin voice simulator answers",
           f"{len(answers)} line(s), {body['timings_ms']['total']} ms, extractor={body['extractor']}")
    missing = [] if body["voice"] == "elevenlabs" else ["ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID"]
    if body["extractor"] != "gemini":
        missing.append("GEMINI_API_KEY")
    record("PASS" if not missing else "WARN", "voice keys (audio URLs + Gemini)",
           "all set" if not missing else "missing: " + ", ".join(missing))
    audio = next((line["audio_url"] for line in body["lines"] if line["audio_url"]), None)
    if audio:
        a_status, _, headers = http("GET", f"{api}{audio}", raw=True)
        record("PASS" if a_status == 200 and "audio" in headers.get("Content-Type", "") else "FAIL",
               "audio URL serves MP3", f"HTTP {a_status}")


@check("Street View metadata")
def street_view(web, rows):
    key = os.getenv("VITE_GOOGLE_MAPS_KEY", "")
    if not key:
        return record("SKIP", "Street View metadata", "VITE_GOOGLE_MAPS_KEY not set here")
    target = next((s for s in rows or [] if not s["is_dv"] and s["lat"] is not None), None)
    if target is None:
        return record("SKIP", "Street View metadata", "no shelter with coordinates")
    url = (f"https://maps.googleapis.com/maps/api/streetview/metadata?location={target['lat']},{target['lng']}"
           f"&source=outdoor&key={key}")
    status, body, _ = http("GET", url, headers={"Referer": f"{web}/"})
    ok = status == 200 and isinstance(body, dict) and body.get("status") in ("OK", "ZERO_RESULTS")
    record("PASS" if ok else "FAIL", "Street View metadata (with the web referrer)",
           f"{body.get('status') if isinstance(body, dict) else status} {body.get('error_message', '') if isinstance(body, dict) else ''}".strip())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api", required=True, help="backend origin, e.g. https://luminestbc-api.onrender.com")
    parser.add_argument("--web", required=True, help="frontend origin, e.g. https://lumi-nest-bc.vercel.app")
    parser.add_argument("--shelter", default="shelter-01", help="demo shelter for the tap and hold checks")
    parser.add_argument("--reset-demo", action="store_true", help="re-apply the full demo state at the end")
    args = parser.parse_args()
    api, web = args.api.rstrip("/"), args.web.rstrip("/")
    key = os.getenv("ADMIN_KEY", "")

    print(f"LuminestBC smoke test\n  api: {api}\n  web: {web}\n")
    health(api)
    rows = shelters(api)
    web_routes(web)
    if key:
        live_flow(api, web, key, args.shelter)
        voice(api, key)
    else:
        record("SKIP", "tag tap / hold / Socket.IO / voice simulator", "set ADMIN_KEY in the environment")
    twilio_signature(api)
    street_view(web, rows)
    if key and args.reset_demo:
        status, body, _ = http("POST", f"{api}/api/admin/reset-demo", headers={"X-Admin-Key": key})
        record("PASS" if status == 200 else "FAIL", "demo state re-applied", f"HTTP {status}")

    counts = {s: sum(1 for r in RESULTS if r[0] == s) for s in ("PASS", "WARN", "FAIL", "SKIP")}
    width = max(len(r[1]) for r in RESULTS)
    print("\n" + "-" * (width + 40))
    for status, name, detail in RESULTS:
        print(f"{status:<5} {name:<{width}}  {detail[:90]}")
    print("-" * (width + 40))
    print(" · ".join(f"{n} {s}" for s, n in counts.items() if n))
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
