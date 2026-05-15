"""Single point of database access for trapline.

All SQL goes through this module. v1 targets SQLite; the canonical baseline
schema lives in ``schema.sql`` and incremental changes in ``migrations/``.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

_DB_DIR = Path(__file__).parent
_SCHEMA_PATH = _DB_DIR / "schema.sql"
_MIGRATIONS_DIR = _DB_DIR / "migrations"

BASELINE_VERSION = "0000_baseline"


def _ensure_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "  version TEXT PRIMARY KEY,"
        "  applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
        ")"
    )


def _applied_versions(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
    return [str(row[0]) for row in rows]


def _record_migration(conn: sqlite3.Connection, version: str) -> None:
    conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))


def _migration_files() -> list[tuple[str, Path]]:
    """Numbered migration files, sorted by version (filename stem)."""
    if not _MIGRATIONS_DIR.exists():
        return []
    return sorted((p.stem, p) for p in _MIGRATIONS_DIR.glob("*.sql"))


class Database:
    """Connection factory and migration runner for the canonical store."""

    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection with foreign keys enforced.

        Commits on clean exit, rolls back on exception.
        """
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def migrate(self) -> list[str]:
        """Apply the baseline schema and any pending migrations.

        Returns the versions applied by this call (empty if already current).
        Safe to call repeatedly.
        """
        newly_applied: list[str] = []
        with self.connect() as conn:
            _ensure_migrations_table(conn)
            done = set(_applied_versions(conn))

            if BASELINE_VERSION not in done:
                conn.executescript(_SCHEMA_PATH.read_text(encoding="utf-8"))
                _record_migration(conn, BASELINE_VERSION)
                newly_applied.append(BASELINE_VERSION)

            for version, sql_path in _migration_files():
                if version in done:
                    continue
                conn.executescript(sql_path.read_text(encoding="utf-8"))
                _record_migration(conn, version)
                newly_applied.append(version)

        return newly_applied

    def applied_migrations(self) -> list[str]:
        """Versions already applied to this database, in order."""
        with self.connect() as conn:
            _ensure_migrations_table(conn)
            return _applied_versions(conn)

    def pending_migrations(self) -> list[str]:
        """Versions that ``migrate()`` would apply, in order."""
        applied = set(self.applied_migrations())
        pending: list[str] = []
        if BASELINE_VERSION not in applied:
            pending.append(BASELINE_VERSION)
        pending.extend(version for version, _ in _migration_files() if version not in applied)
        return pending
