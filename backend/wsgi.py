"""Production entry point (Render):
    gunicorn -w 1 --threads 100 -b 0.0.0.0:$PORT wsgi:app
Exactly one worker: Socket.IO state and background jobs live in this one process.
"""
import logging

from app import create_app
from app.jobs import start_jobs

logging.basicConfig(level=logging.INFO)
app = create_app()
start_jobs()
