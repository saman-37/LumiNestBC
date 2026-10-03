"""Test fixtures. Tests run against a real Postgres/TimescaleDB (docker compose up -d).

Uses a separate database (TEST_DATABASE_URL, default luminestbc_test) that is created
automatically and wiped before every test.
"""
import os
from pathlib import Path

import psycopg
import pytest
from psycopg.conninfo import conninfo_to_dict, make_conninfo

from app import config

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://luminest:luminest@localhost:5432/luminestbc_test"
)
SCHEMA = Path(__file__).resolve().parents[1] / "sql" / "schema.sql"


def _ensure_database() -> None:
    dbname = conninfo_to_dict(TEST_DATABASE_URL)["dbname"]
    admin_url = make_conninfo(TEST_DATABASE_URL, dbname="postgres")
    try:
        with psycopg.connect(admin_url, autocommit=True, connect_timeout=3) as conn:
            exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,)).fetchone()
            if not exists:
                conn.execute(f'CREATE DATABASE "{dbname}"')
    except psycopg.OperationalError as exc:
        pytest.exit(f"Can't reach the test database ({exc}). Run `docker compose up -d` first.", 2)
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as conn:
        conn.execute(SCHEMA.read_text())


@pytest.fixture(scope="session")
def app():
    _ensure_database()
    from app import create_app

    return create_app(database_url=TEST_DATABASE_URL)


@pytest.fixture
def db(app):
    """A fresh, empty database for each test. Yields an autocommit connection."""
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True, row_factory=psycopg.rows.dict_row) as conn:
        conn.execute("TRUNCATE availability_events, processed_taps, holds, tags, shelters CASCADE")
        yield conn


@pytest.fixture
def client(app, db):
    return app.test_client()


def add_shelter(db, shelter_id="shelter-01", **fields):
    row = {
        "id": shelter_id, "name": f"Test {shelter_id}", "address": "1 Test St",
        "lat": 49.28, "lng": -123.1, "capacity": 10, "open_beds": 2, **fields,
    }
    cols = ", ".join(row)
    vals = ", ".join(f"%({c})s" for c in row)
    db.execute(f"INSERT INTO shelters ({cols}) VALUES ({vals})", row)
    return row


def add_tag(db, shelter_id="shelter-01", action="freed", secret="s3cretS3cretS3cr"):
    db.execute(
        "INSERT INTO tags (id, shelter_id, action, secret) VALUES (%s, %s, %s, %s)",
        (f"{shelter_id}-{action}", shelter_id, action, secret),
    )
    return secret


def open_beds(db, shelter_id="shelter-01") -> int:
    return db.execute("SELECT open_beds FROM shelters WHERE id = %s", (shelter_id,)).fetchone()["open_beds"]


def rewind_tag(db, shelter_id="shelter-01", action="freed", seconds=None):
    """Pretend the tag was last tapped long enough ago to be outside the cooldown."""
    seconds = seconds or config.TAG_COOLDOWN_SECONDS + 1
    db.execute(
        "UPDATE tags SET last_tap_at = now() - %s::int * interval '1 second'"
        " WHERE shelter_id = %s AND action = %s",
        (seconds, shelter_id, action),
    )
