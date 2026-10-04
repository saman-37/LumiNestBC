import gzip
import re

from flask import Flask, request, send_from_directory
from flask_cors import CORS

from . import config
from .db import init_pool
from .sockets import socketio


# Phones on the same Wi-Fi open the dev app at http://<laptop LAN IP>:5173.
_LAN_ORIGIN = re.compile(
    r"^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+"
    r"|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$"
)


def socket_origins(allow_lan: bool):
    """Origins allowed to open Socket.IO. allow_lan (dev server only) also accepts private-network
    addresses, so a phone on the same Wi-Fi gets live updates. Production uses FRONTEND_ORIGIN only."""
    if not allow_lan:
        return config.FRONTEND_ORIGINS
    return lambda origin: origin in config.FRONTEND_ORIGINS or bool(_LAN_ORIGIN.match(origin or ""))


def create_app(database_url: str | None = None, allow_lan_origins: bool = False) -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": config.FRONTEND_ORIGINS}})
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

    @app.get("/health")
    def health():
        return {"ok": True}

    # Serve built frontend from frontend/dist if present (allows running everything on Port 8000)
    dist_dir = config.REPO_ROOT / "frontend" / "dist"

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path.startswith(("api/", "socket.io", "twilio/", "health", "audio/")):
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

