"""Local dev server with auto-reload: python run.py  (http://localhost:8000)"""
import logging
import os

from app import config, create_app
from app.db import prepare_database
from app.jobs import start_jobs
from app.sockets import socketio

logging.basicConfig(level=logging.INFO)
if os.environ.get("WERKZEUG_RUN_MAIN") == "true":  # once, in the process that serves requests
    prepare_database(config.DATABASE_URL, migrate=config.AUTO_MIGRATE)
app = create_app(allow_lan_origins=True)  # phones on the same Wi-Fi (dev only)

if __name__ == "__main__":
    # With the reloader on, only the child process (WERKZEUG_RUN_MAIN=true) serves requests.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        start_jobs()
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")),
                 debug=True, use_reloader=True, allow_unsafe_werkzeug=True)
