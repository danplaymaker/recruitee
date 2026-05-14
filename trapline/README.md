# trapline

Value-betting system for UK & Irish greyhound racing. Ingests race results and
live market prices, produces calibrated fair-odds estimates, flags runners whose
offered price exceeds fair value by a configurable margin, and tracks Closing
Line Value (CLV) on every flagged bet.

See `docs/brief.md` (the original project brief) for full architecture, data
model, and build sequence. This README only covers local development.

## Status

Phase 1, step 1: scaffolding only. No scrapers, no model, no live monitor yet.

## Requirements

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/) (recommended) or any PEP 621 installer

## Setup

```bash
cd trapline
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

## Tooling

```bash
ruff check .          # lint
ruff format .         # format
mypy                  # type-check (strict, src/trapline only)
pytest                # run tests
pytest --cov          # with coverage
```

## CLI

```bash
trapline --help
trapline version
```

## Layout

```
trapline/
├── config/                       # YAML tunables, track metadata
├── data/                         # gitignored; raw scrapes + SQLite DB
├── models/                       # gitignored except registry.json
├── src/trapline/
│   ├── db/                       # schema, migrations, repository
│   ├── ingest/                   # scrapers, Betfair clients, reconciliation
│   ├── features/                 # form, sectional, trap, trainer, race-context
│   ├── models/                   # train, calibrate, predict, evaluate
│   ├── execution/                # value engine, alerter, Betfair client
│   ├── reporting/                # daily HTML report, CLV dashboard
│   └── cli.py                    # Typer entrypoint
├── tests/
└── scripts/
```
