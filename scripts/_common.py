"""Shared helpers for scripts. Owner: Design/data (Person 4).

Run scripts from the repo root with the backend venv active:
    source backend/.venv/bin/activate && python scripts/<name>.py
"""
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

TAG_ACTIONS = ("freed", "filled", "full", "arrive")


def connect() -> psycopg.Connection:
    url = os.getenv("DATABASE_URL", "postgresql://luminest:luminest@localhost:5432/luminestbc")
    return psycopg.connect(url, row_factory=dict_row)
