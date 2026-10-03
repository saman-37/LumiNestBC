"""Local dev server with auto-reload: python run.py  (http://localhost:8000)"""
import logging
import os

from app import create_app
from app.jobs import start_jobs
from app.sockets import socketio

logging.basicConfig(level=logging.INFO)
app = create_app()

if __name__ == "__main__":
    # With the reloader on, only the child process (WERKZEUG_RUN_MAIN=true) serves requests.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        start_jobs()
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")),
                 debug=True, use_reloader=True, allow_unsafe_werkzeug=True)
