from pathlib import Path
from flask import Flask, send_from_directory
from flask_cors import CORS

from . import config
from .db import init_pool
from .sockets import socketio


def create_app(database_url: str | None = None) -> Flask:
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": config.FRONTEND_ORIGINS}})
    init_pool(database_url or config.DATABASE_URL, config.DB_POOL_MAX_SIZE)

    from .comms.twilio_routes import bp as comms_bp
    from .routes.holds import bp as holds_bp
    from .routes.shelters import bp as shelters_bp
    from .routes.tags import bp as tags_bp
    from .routes.tier3 import bp as tier3_bp

    for bp in (shelters_bp, tags_bp, holds_bp, tier3_bp, comms_bp):
        app.register_blueprint(bp)

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

    socketio.init_app(app, cors_allowed_origins=config.FRONTEND_ORIGINS, async_mode="threading")
    return app

