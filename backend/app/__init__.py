import gzip
import re

import psycopg
from flask import Flask, request, send_from_directory
from flask_cors import CORS
from psycopg_pool import PoolTimeout

from . import config
from .db import init_pool, ping
from .sockets import socketio


# Phones on the same Wi-Fi open the dev app at http://<laptop LAN IP>:5173.
_LAN_ORIGIN = re.compile(
    r"^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+"
    r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
)


def origin_pattern() -> re.Pattern | None:
    """FRONTEND_ORIGIN_REGEX compiled to match the whole origin (Vercel preview URLs), or None."""
    if not config.FRONTEND_ORIGIN_REGEX:
        return None
    try:
        return re.compile(rf"(?:{config.FRONTEND_ORIGIN_REGEX})\Z")
    except re.error as exc:
        raise ValueError(f"FRONTEND_ORIGIN_REGEX is not a valid regex: {exc}") from None


def cors_origins() -> list:
    """Origins for Flask-CORS on /api/*: the FRONTEND_ORIGIN list plus FRONTEND_ORIGIN_REGEX."""
    pattern = origin_pattern()
    return config.FRONTEND_ORIGINS + ([pattern] if pattern else [])


def socket_origins(allow_lan: bool):
    """Origins allowed to open Socket.IO: FRONTEND_ORIGIN, FRONTEND_ORIGIN_REGEX, and with allow_lan
    (dev server only) private-network addresses, so a phone on the same Wi-Fi gets live updates."""
    pattern = origin_pattern()

    def allowed(origin: str | None) -> bool:
        if not origin:
            return False
        return (origin in config.FRONTEND_ORIGINS or bool(pattern and pattern.match(origin))
                or (allow_lan and bool(_LAN_ORIGIN.match(origin))))
    return allowed


def create_app(database_url: str | None = None, allow_lan_origins: bool = False) -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": cors_origins()}})
    init_pool(database_url or config.DATABASE_URL, config.DB_POOL_MAX_SIZE)

    from .comms.twilio_routes import bp as comms_bp
    from .routes.holds import bp as holds_bp
    from .routes.shelters import bp as shelters_bp
    from .routes.tags import bp as tags_bp
    from .routes.admin import bp as admin_bp
    from .routes.staff import bp as staff_bp
    from .routes.tier3 import bp as tier3_bp

    for bp in (shelters_bp, tags_bp, holds_bp, staff_bp, admin_bp, tier3_bp, comms_bp):
        app.register_blueprint(bp)

    @app.after_request
    def compress_json(response):
        """Gzip larger API responses (/api/shelters is ~46 KB raw, ~5 KB gzipped): phones on slow
        data get the map list much sooner. Socket.IO traffic doesn't pass through here."""
        if (request.path.startswith("/api/") and response.mimetype == "application/json"
                and "gzip" in request.headers.get("Accept-Encoding", "")
                and not response.direct_passthrough and "Content-Encoding" not in response.headers):
            data = response.get_data()
            if len(data) > 1024:
                response.set_data(gzip.compress(data, compresslevel=5))
                response.headers["Content-Encoding"] = "gzip"
                response.headers["Content-Length"] = str(len(response.get_data()))
                response.vary.add("Accept-Encoding")
        return response

    @app.errorhandler(PoolTimeout)
    @app.errorhandler(psycopg.OperationalError)
    def database_unavailable(exc):
        """Database down or unreachable: a clear 503 instead of a 500 traceback."""
        app.logger.error("database unavailable on %s %s: %s", request.method, request.path,
                         type(exc).__name__)
        return {"error": "database_unavailable"}, 503, {"Retry-After": "30"}

    @app.get("/health")
    def health():
        """Liveness: the process answers. Doesn't touch the database."""
        return {"ok": True}

    @app.get("/ready")
    def ready():
        """Readiness: the database answers too. Render's health check uses this, so a deploy
        with an unreachable database never goes live."""
        if not ping():
            return {"ok": False, "error": "database_unavailable"}, 503
        return {"ok": True, "database": "ok"}

    # Serve built frontend from frontend/dist if present (allows running everything on Port 8000)
    dist_dir = config.REPO_ROOT / "frontend" / "dist"

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path.startswith(("api/", "socket.io", "twilio/", "health", "ready", "audio/")):
            return {"error": "not_found"}, 404
        target = dist_dir / path
        if path and target.is_file():
            return send_from_directory(dist_dir, path)
        index_file = dist_dir / "index.html"
        if index_file.exists():
            return send_from_directory(dist_dir, "index.html")
        return {
            "error": "frontend_not_built",
            "message": "Run `npm run build` in the frontend/ directory first.",
        }, 404

    socketio.init_app(app, cors_allowed_origins=socket_origins(allow_lan_origins), async_mode="threading")
    return app

