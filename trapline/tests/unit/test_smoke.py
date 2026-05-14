from __future__ import annotations

from typer.testing import CliRunner

import trapline
from trapline.cli import app


def test_package_has_version() -> None:
    assert isinstance(trapline.__version__, str)
    assert trapline.__version__


def test_cli_version_command() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "trapline" in result.stdout


def test_cli_help_exits_zero() -> None:
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
