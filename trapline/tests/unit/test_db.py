from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from trapline.db.repository import BASELINE_VERSION, Database

_EXPECTED_TABLES = {
    "dim_track",
    "dim_dog",
    "dim_trainer",
    "fact_race",
    "fact_run",
    "fact_price_history",
    "fact_prediction",
    "fact_bet",
    "name_alias",
    "schema_migrations",
}


def test_migrate_creates_full_schema(tmp_path: Path) -> None:
    db = Database(tmp_path / "trapline.db")
    applied = db.migrate()

    assert applied == [BASELINE_VERSION]
    with db.connect() as conn:
        tables = {
            str(row[0]) for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    assert tables >= _EXPECTED_TABLES


def test_migrate_is_idempotent(tmp_path: Path) -> None:
    db = Database(tmp_path / "trapline.db")
    db.migrate()

    assert db.migrate() == []
    assert db.applied_migrations() == [BASELINE_VERSION]
    assert db.pending_migrations() == []


def test_pending_before_migrate(tmp_path: Path) -> None:
    db = Database(tmp_path / "trapline.db")
    assert db.pending_migrations() == [BASELINE_VERSION]
    assert db.applied_migrations() == []


def test_foreign_keys_are_enforced(tmp_path: Path) -> None:
    db = Database(tmp_path / "trapline.db")
    db.migrate()

    with pytest.raises(sqlite3.IntegrityError), db.connect() as conn:
        conn.execute(
            "INSERT INTO fact_race (track_id, race_date, race_time, distance_m) "
            "VALUES (999, '2026-01-01', '19:30', 480)"
        )


def test_check_constraint_rejects_bad_trap(tmp_path: Path) -> None:
    db = Database(tmp_path / "trapline.db")
    db.migrate()

    with db.connect() as conn:
        conn.execute("INSERT INTO dim_track (track_id, name, country) VALUES (1, 'Romford', 'GB')")
        conn.execute(
            "INSERT INTO fact_race (race_id, track_id, race_date, race_time, distance_m) "
            "VALUES (1, 1, '2026-01-01', '19:30', 480)"
        )
        conn.execute("INSERT INTO dim_dog (dog_id, name) VALUES (1, 'Swift Tail')")
        conn.execute("INSERT INTO dim_trainer (trainer_id, name) VALUES (1, 'A Trainer')")

    with pytest.raises(sqlite3.IntegrityError), db.connect() as conn:
        conn.execute("INSERT INTO fact_run (race_id, dog_id, trainer_id, trap) VALUES (1, 1, 1, 9)")
