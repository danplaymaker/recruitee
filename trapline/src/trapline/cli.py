from __future__ import annotations

import typer
from rich.console import Console

from trapline import __version__
from trapline.config import load_config
from trapline.db.repository import Database

app = typer.Typer(
    name="trapline",
    help="Value-betting CLI for UK & Irish greyhound racing.",
    no_args_is_help=True,
)
db_app = typer.Typer(help="Database schema and migrations.", no_args_is_help=True)
app.add_typer(db_app, name="db")
console = Console()


@app.callback()
def _main() -> None:
    """trapline CLI entrypoint."""


@app.command("version")
def version_cmd() -> None:
    """Print the installed trapline version."""
    console.print(f"trapline {__version__}")


@db_app.command("migrate")
def db_migrate() -> None:
    """Apply the baseline schema and any pending migrations."""
    db = Database(load_config().database.path)
    applied = db.migrate()
    if applied:
        for version in applied:
            console.print(f"[green]applied[/green] {version}")
        console.print(f"{len(applied)} migration(s) applied.")
    else:
        console.print("Database is up to date.")


@db_app.command("status")
def db_status() -> None:
    """Show applied and pending migrations."""
    cfg = load_config()
    db = Database(cfg.database.path)
    console.print(f"database: {cfg.database.path}")
    applied = db.applied_migrations()
    pending = db.pending_migrations()
    console.print(f"applied: {len(applied)}")
    for version in applied:
        console.print(f"  [green]ok[/green] {version}")
    console.print(f"pending: {len(pending)}")
    for version in pending:
        console.print(f"  [yellow]--[/yellow] {version}")


if __name__ == "__main__":
    app()
