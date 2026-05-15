from __future__ import annotations

from pathlib import Path

import pytest

from trapline.config import load_config


def test_loads_db_path_from_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TRAPLINE_DB_PATH", raising=False)
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text("database:\n  path: data/custom.db\n", encoding="utf-8")

    cfg = load_config(cfg_file)

    assert cfg.database.path == Path("data/custom.db")


def test_env_var_overrides_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text("database:\n  path: data/custom.db\n", encoding="utf-8")
    monkeypatch.setenv("TRAPLINE_DB_PATH", "/var/lib/trapline/prod.db")

    cfg = load_config(cfg_file)

    assert cfg.database.path == Path("/var/lib/trapline/prod.db")


def test_falls_back_to_default_when_file_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("TRAPLINE_DB_PATH", raising=False)

    cfg = load_config(tmp_path / "does-not-exist.yaml")

    assert cfg.database.path == Path("data/trapline.db")
