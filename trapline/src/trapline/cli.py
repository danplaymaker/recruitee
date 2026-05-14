from __future__ import annotations

import typer
from rich.console import Console

from trapline import __version__

app = typer.Typer(
    name="trapline",
    help="Value-betting CLI for UK & Irish greyhound racing.",
    no_args_is_help=True,
)
console = Console()


@app.callback()
def _main() -> None:
    """trapline CLI entrypoint."""


@app.command("version")
def version_cmd() -> None:
    """Print the installed trapline version."""
    console.print(f"trapline {__version__}")


if __name__ == "__main__":
    app()
