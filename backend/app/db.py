"""Postgres connection pool (psycopg 3). Owner: Backend (Person 2).

Usage:
    with transaction() as conn:
        row = conn.execute("SELECT ...", (arg,)).fetchone()   # rows are dicts

The block commits when it exits normally and rolls back on an exception.

describe_url() / connection_hints() explain a bad DATABASE_URL without ever printing the
password; scripts/check_db.py and startup logging both use them.
"""
import logging
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

log = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "sql" / "schema.sql"
VALID_SSLMODES = ("disable", "allow", "prefer", "require", "verify-ca", "verify-full")

_pool: ConnectionPool | None = None


def init_pool(database_url: str, max_size: int) -> None:
    global _pool
    if _pool is not None:
        _pool.close()
    _pool = ConnectionPool(
        database_url,
        min_size=1,
        max_size=max_size,
        kwargs={"row_factory": dict_row},
        check=ConnectionPool.check_connection,  # cloud DBs drop idle connections
        timeout=10,
        open=True,
    )


@contextmanager
def transaction():
    if _pool is None:
        raise RuntimeError("init_pool() has not been called")
    with _pool.connection() as conn:
        yield conn


def ping(timeout: float = 3.0) -> bool:
    """True if a pooled connection answers SELECT 1 within timeout seconds (used by /ready)."""
    if _pool is None:
        return False
    try:
        with _pool.connection(timeout=timeout) as conn:
            conn.execute("SELECT 1")
        return True
    except (PoolTimeout, psycopg.Error):
        return False


# --- Diagnosis (never prints the password) ---------------------------------------------

def describe_url(url: str) -> dict:
    """host, port, dbname, user and sslmode of a connection string. Raises ValueError if unparseable."""
    try:
        parts = conninfo_to_dict(url)
    except psycopg.ProgrammingError as exc:
        raise ValueError(redact(str(exc), url)) from None
    return {
        "host": parts.get("host") or "localhost",
        "port": parts.get("port") or "5432",
        "dbname": parts.get("dbname") or "",
        "user": parts.get("user") or "",
        "sslmode": parts.get("sslmode") or "",
        "has_password": bool(parts.get("password")),
    }


def redact(text: str, url: str) -> str:
    """Remove the password (raw and URL-encoded forms) from any message before it's shown."""
    try:
        password = conninfo_to_dict(url).get("password")
    except psycopg.ProgrammingError:
        password = None
    if password:
        from urllib.parse import quote
        for form in {password, quote(password, safe="")}:
            text = text.replace(form, "***")
    return text


def connection_hints(url: str, error: str = "") -> list[str]:
    """Plain-language fixes for the usual cloud-database mistakes."""
    hints = []
    try:
        info = describe_url(url)
    except ValueError:
        return ["The connection string can't be parsed. Copy a fresh one from Tiger Data's Connect button, "
                "and URL-encode special characters in the password (@ → %40, # → %23, / → %2F)."]
    sslmode = info["sslmode"]
    if sslmode and sslmode not in VALID_SSLMODES:
        hints.append(f'sslmode="{sslmode}" is not valid; it must be one of {", ".join(VALID_SSLMODES)} '
                     '(the usual fix is ?sslmode=require, with the final "e").')
    is_local = info["host"] in ("localhost", "127.0.0.1", "::1") or info["host"].startswith("/")
    if not sslmode and not is_local:
        hints.append("Add ?sslmode=require to the end of the connection string (cloud databases need SSL).")
    lowered = error.lower()
    if "password authentication failed" in lowered:
        hints.append("Wrong user or password. Copy a fresh string from Tiger Data's Connect button; URL-encode "
                     "special characters in the password.")
    if "could not translate host name" in lowered or "nodename nor servname" in lowered:
        hints.append("The host name doesn't resolve. Check for a typo, and that the Tiger Data service still exists.")
    if "timeout" in lowered or "timed out" in lowered:
        hints.append("Connection timed out. If Tiger Data has an IP allowlist on, allow Render's outbound IPs "
                     "(Render dashboard → service → Connect → Outbound).")
    return hints


def check_connection(url: str, timeout: int = 10) -> str | None:
    """None if the database answers; otherwise a password-free error message with hints."""
    try:
        with psycopg.connect(url, connect_timeout=timeout) as conn:
            conn.execute("SELECT 1")
        return None
    except (psycopg.Error, ValueError) as exc:
        message = redact(str(exc).strip(), url)
        hints = connection_hints(url, message)
        return message + ("".join(f"\n  hint: {h}" for h in hints) if hints else "")


def apply_schema(url: str) -> None:
    """Run sql/schema.sql (idempotent): a fresh database is ready, an older one gets new columns."""
    with psycopg.connect(url, autocommit=True, connect_timeout=10) as conn:
        conn.execute(SCHEMA_PATH.read_text())


def prepare_database(url: str, migrate: bool = True) -> bool:
    """Startup check: log a clear (password-free) error if the database is unreachable, then migrate."""
    try:
        target = describe_url(url)
        where = f"{target['host']}:{target['port']}/{target['dbname']} (sslmode={target['sslmode'] or 'default'})"
    except ValueError:
        where = "(unparseable DATABASE_URL)"
    error = check_connection(url)
    if error:
        log.error("DATABASE UNREACHABLE at %s: %s", where, error)
        return False
    if migrate:
        try:
            apply_schema(url)
            log.info("database ready at %s; schema applied", where)
        except psycopg.Error as exc:
            log.error("schema migration failed at %s: %s", where, redact(str(exc), url))
            return False
    return True
