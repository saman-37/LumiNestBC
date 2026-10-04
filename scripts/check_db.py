"""Diagnose a DATABASE_URL step by step, without ever printing the password.

    python scripts/check_db.py                                   # DATABASE_URL from the env / .env
    DATABASE_URL="$PROD_DATABASE_URL" python scripts/check_db.py # check production

Checks: the string parses (and sslmode is valid), the host resolves, the port answers, we can
log in, the connection uses SSL, TimescaleDB is installed, and our tables (plus the newest
column) exist. Exits 1 on the first hard failure, 0 when the database is ready to use.
"""
import os
import socket
import sys

from _common import ROOT  # noqa: F401  (loads .env without overriding the environment)

import psycopg

from app.db import connection_hints, describe_url, redact

TABLES = ("shelters", "tags", "holds", "processed_taps", "availability_events", "staff_keys")


def line(ok: bool | None, label: str, detail: str = "") -> None:
    mark = {True: "PASS", False: "FAIL", None: "WARN"}[ok]
    print(f"  [{mark}] {label}{': ' + detail if detail else ''}")


def fail(url: str, label: str, error: str) -> None:
    line(False, label, redact(error, url))
    for hint in connection_hints(url, error):
        print(f"         hint: {hint}")
    sys.exit(1)


def main() -> None:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        sys.exit("DATABASE_URL is not set.")
    print("LuminestBC database check")

    try:
        info = describe_url(url)
    except ValueError as exc:
        fail(url, "parse connection string", str(exc))
    print(f"  target: {info['user'] or '?'}@{info['host']}:{info['port']}/{info['dbname']}"
          f"  sslmode={info['sslmode'] or '(not set)'}  password={'set' if info['has_password'] else 'missing'}")
    hints = connection_hints(url)
    for hint in hints:
        line(None, "connection string", hint)

    try:
        addresses = {a[4][0] for a in socket.getaddrinfo(info["host"], int(info["port"]), proto=socket.IPPROTO_TCP)}
        line(True, "host resolves", ", ".join(sorted(addresses)[:3]))
    except (socket.gaierror, ValueError) as exc:
        fail(url, "host resolves", f"could not translate host name ({exc})")

    try:
        socket.create_connection((info["host"], int(info["port"])), timeout=8).close()
        line(True, "port answers", info["port"])
    except OSError as exc:
        fail(url, "port answers", f"timed out or refused ({exc})")

    try:
        conn = psycopg.connect(url, connect_timeout=10, autocommit=True)
    except psycopg.Error as exc:
        fail(url, "log in", str(exc))
    with conn:
        line(True, "log in", conn.execute("SHOW server_version").fetchone()[0])

        ssl = conn.execute("SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()").fetchone()
        if ssl and ssl[0]:
            line(True, "SSL", ssl[1])
        else:
            line(None if info["host"] in ("localhost", "127.0.0.1") else False, "SSL",
                 "connection is not encrypted (add ?sslmode=require)")

        ext = conn.execute("SELECT extversion FROM pg_extension WHERE extname = 'timescaledb'").fetchone()
        if ext:
            line(True, "TimescaleDB extension", ext[0])
        else:
            available = conn.execute(
                "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb'").fetchone()
            line(False if not available else None, "TimescaleDB extension",
                 "available, not installed yet (the schema installs it)" if available else "not available on this server")

        present = {r[0] for r in conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'").fetchall()}
        missing = [t for t in TABLES if t not in present]
        if missing:
            line(None, "tables", f"missing {', '.join(missing)} (run scripts/seed_production.py, or start the "
                                 "backend: it applies the schema on startup)")
        else:
            count = conn.execute("SELECT count(*) FROM shelters").fetchone()[0]
            line(True, "tables", f"all {len(TABLES)} present, {count} shelter(s)")
            has_phone = conn.execute(
                "SELECT 1 FROM information_schema.columns WHERE table_name = 'shelters' AND column_name = 'public_phone'"
            ).fetchone()
            line(True if has_phone else None, "latest schema",
                 "public_phone column present" if has_phone else "public_phone missing (schema not applied yet)")
    print("database OK")


if __name__ == "__main__":
    main()
