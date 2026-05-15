from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

DEFAULT_CONFIG_PATH = Path("config/default.yaml")
DEFAULT_DB_PATH = Path("data/trapline.db")


@dataclass(frozen=True, slots=True)
class DatabaseConfig:
    path: Path


@dataclass(frozen=True, slots=True)
class Config:
    database: DatabaseConfig


def load_config(config_path: Path | None = None) -> Config:
    """Load runtime configuration.

    Resolution order for the config file: explicit argument, then the
    ``TRAPLINE_CONFIG`` env var, then ``config/default.yaml``. The database
    path can additionally be overridden by ``TRAPLINE_DB_PATH``.
    """
    path = config_path or Path(os.environ.get("TRAPLINE_CONFIG", DEFAULT_CONFIG_PATH))

    raw: dict[str, object] = {}
    if path.exists():
        loaded = yaml.safe_load(path.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            raw = loaded

    db_path_from_file = ""
    db_section = raw.get("database")
    if isinstance(db_section, dict):
        candidate = db_section.get("path")
        if isinstance(candidate, str):
            db_path_from_file = candidate

    db_path = os.environ.get("TRAPLINE_DB_PATH") or db_path_from_file or str(DEFAULT_DB_PATH)
    return Config(database=DatabaseConfig(path=Path(db_path)))
