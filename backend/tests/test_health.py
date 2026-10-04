from flask import Flask
from flask_cors import CORS
from psycopg_pool import PoolTimeout

from app import config, cors_origins, db as db_module, socket_origins

PREVIEW_REGEX = r"https://lumi-nest-bc-[a-z0-9-]+-samans-projects-3127ae22\.vercel\.app"
PREVIEW = "https://lumi-nest-bc-git-feat-web-voice-match-samans-projects-3127ae22.vercel.app"


class DownPool:
    def connection(self, timeout=None):
        raise PoolTimeout("couldn't get a connection")


def test_ready_checks_database(client, monkeypatch):
    assert client.get("/ready").json == {"ok": True, "database": "ok"}
    monkeypatch.setattr(db_module, "_pool", DownPool())
    res = client.get("/ready")
    assert res.status_code == 503 and res.json["error"] == "database_unavailable"
    assert client.get("/health").status_code == 200  # liveness doesn't touch the database


def test_api_answers_503_when_database_down(client, monkeypatch):
    monkeypatch.setattr(db_module, "_pool", DownPool())
    res = client.get("/api/shelters")
    assert res.status_code == 503
    assert res.json == {"error": "database_unavailable"}
    assert res.headers["Retry-After"] == "30"


def test_socket_origins_accept_previews_of_this_project_only(monkeypatch):
    monkeypatch.setattr(config, "FRONTEND_ORIGINS", ["https://lumi-nest-bc.vercel.app"])
    monkeypatch.setattr(config, "FRONTEND_ORIGIN_REGEX", PREVIEW_REGEX)
    allowed = socket_origins(allow_lan=False)
    assert allowed("https://lumi-nest-bc.vercel.app")
    assert allowed(PREVIEW)
    assert not allowed("https://lumi-nest-bc-x-someone-else.vercel.app")
    assert not allowed(PREVIEW + ".evil.com")
    assert not allowed("https://evil.com/" + PREVIEW)
    assert not allowed("http://localhost:5173")
    assert not allowed(None)
    assert socket_origins(allow_lan=True)("http://192.168.1.5:5173")


def test_rest_cors_uses_the_same_origins(monkeypatch):
    monkeypatch.setattr(config, "FRONTEND_ORIGINS", ["https://lumi-nest-bc.vercel.app"])
    monkeypatch.setattr(config, "FRONTEND_ORIGIN_REGEX", PREVIEW_REGEX)
    mini = Flask(__name__)
    CORS(mini, resources={r"/api/*": {"origins": cors_origins()}})
    mini.get("/api/x")(lambda: {"ok": True})
    c = mini.test_client()
    assert c.get("/api/x", headers={"Origin": PREVIEW}).headers.get("Access-Control-Allow-Origin") == PREVIEW
    bad = c.get("/api/x", headers={"Origin": PREVIEW + ".evil.com"})
    assert "Access-Control-Allow-Origin" not in bad.headers
