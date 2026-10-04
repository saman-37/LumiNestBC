"""Production entry point (Render):
    gunicorn -w 1 --threads 100 -b 0.0.0.0:$PORT wsgi:app
Exactly one worker: Socket.IO state and background jobs live in this one process.

On startup the database is checked (a clear, password-free error is logged if it can't be
reached) and sql/schema.sql is applied, so a fresh Tiger Data database needs no manual step.
"""
import logging

from app import config, create_app
from app.db import prepare_database
from app.jobs import start_jobs

logging.basicConfig(level=logging.INFO)
prepare_database(config.DATABASE_URL, migrate=config.AUTO_MIGRATE)
app = create_app()
start_jobs()
