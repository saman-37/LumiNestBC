"""Postgres connection pool (psycopg 3). Owner: Backend (Person 2).

Usage:
    with transaction() as conn:
        row = conn.execute("SELECT ...", (arg,)).fetchone()   # rows are dicts

The block commits when it exits normally and rolls back on an exception.
"""
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

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
