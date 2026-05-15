-- trapline canonical schema (baseline).
--
-- Applied once by the migration runner (src/trapline/db/repository.py) as
-- version '0000_baseline'. Incremental changes after this baseline go in
-- db/migrations/ as numbered .sql files (e.g. 0001_add_weather.sql).
--
-- Conventions:
--   * All timestamps stored as UTC ISO-8601 text; display converts to
--     Europe/London at the edge.
--   * Dimensional model: facts reference dimensions.
--   * Statements use IF NOT EXISTS so a partially-applied baseline is
--     safely resumable.

-- ---------------------------------------------------------------------------
-- Dimensions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_track (
    track_id        INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    country         TEXT NOT NULL CHECK(country IN ('GB', 'IE')),
    circumference_m INTEGER,
    surface         TEXT
);

CREATE TABLE IF NOT EXISTS dim_dog (
    dog_id          INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    sex             TEXT CHECK(sex IN ('d', 'b')),
    dob             DATE,
    sire            TEXT,
    dam             TEXT,
    UNIQUE(name, dob)                      -- handle reused litter names
);

CREATE TABLE IF NOT EXISTS dim_trainer (
    trainer_id      INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    track_base      INTEGER REFERENCES dim_track(track_id)
);

-- ---------------------------------------------------------------------------
-- Facts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_race (
    race_id         INTEGER PRIMARY KEY,
    track_id        INTEGER NOT NULL REFERENCES dim_track(track_id),
    race_date       DATE NOT NULL,
    race_time       TIME NOT NULL,
    distance_m      INTEGER NOT NULL,
    grade           TEXT,                  -- 'A1'-'A11', 'OR', 'HP', etc.
    race_type       TEXT,                  -- 'flat', 'hurdles'
    going           TEXT,                  -- 'normal', 'slow', 'fast'
    prize_total     REAL,
    UNIQUE(track_id, race_date, race_time)
);

CREATE TABLE IF NOT EXISTS fact_run (
    run_id          INTEGER PRIMARY KEY,
    race_id         INTEGER NOT NULL REFERENCES fact_race(race_id),
    dog_id          INTEGER NOT NULL REFERENCES dim_dog(dog_id),
    trainer_id      INTEGER NOT NULL REFERENCES dim_trainer(trainer_id),
    trap            INTEGER NOT NULL CHECK(trap BETWEEN 1 AND 8),
    weight_kg       REAL,
    finish_pos      INTEGER,               -- NULL if pre-race
    finish_time_s   REAL,
    sectional_s     REAL,                  -- first-bend split
    beaten_lengths  REAL,
    sp_decimal      REAL,                  -- starting price
    bsp_decimal     REAL,                  -- Betfair starting price
    comment         TEXT,
    UNIQUE(race_id, dog_id),
    UNIQUE(race_id, trap)
);

CREATE TABLE IF NOT EXISTS fact_price_history (
    -- Pre-race odds movement, keyed to run_id.
    price_id        INTEGER PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES fact_run(run_id),
    captured_at     TIMESTAMP NOT NULL,
    source          TEXT NOT NULL,         -- 'betfair_back', 'betfair_lay', etc.
    decimal_odds    REAL NOT NULL,
    available_size  REAL                   -- liquidity at this price
);

-- ---------------------------------------------------------------------------
-- Predictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_prediction (
    prediction_id   INTEGER PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES fact_run(run_id),
    model_version   TEXT NOT NULL,
    predicted_at    TIMESTAMP NOT NULL,
    raw_score       REAL NOT NULL,
    win_probability REAL NOT NULL,         -- normalized across race
    fair_odds       REAL NOT NULL,         -- 1 / win_probability
    features_hash   TEXT NOT NULL          -- for reproducibility
);

-- ---------------------------------------------------------------------------
-- Bet log (every recommended bet, placed or not)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_bet (
    bet_id          INTEGER PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES fact_run(run_id),
    prediction_id   INTEGER NOT NULL REFERENCES fact_prediction(prediction_id),
    flagged_at      TIMESTAMP NOT NULL,
    flagged_odds    REAL NOT NULL,
    fair_odds       REAL NOT NULL,
    edge_pct        REAL NOT NULL,         -- (flagged / fair) - 1
    stake_units     REAL,
    placed          BOOLEAN NOT NULL,
    matched_odds    REAL,                  -- actual odds achieved
    bsp_decimal     REAL,                  -- for CLV calc
    pnl_units       REAL,
    clv_pct         REAL                   -- ((matched/bsp)-1) * 100
);

-- ---------------------------------------------------------------------------
-- Name reconciliation (see brief 4.3): maps source-side raw names to
-- canonical dimension ids for dogs, trainers, and tracks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS name_alias (
    alias_id        INTEGER PRIMARY KEY,
    entity_type     TEXT NOT NULL CHECK(entity_type IN ('dog', 'trainer', 'track')),
    raw_name        TEXT NOT NULL,
    canonical_id    INTEGER NOT NULL,      -- references the matching dim table
    source          TEXT,                 -- which scraper produced the raw name
    confidence      REAL,                 -- rapidfuzz score of the match
    UNIQUE(entity_type, raw_name, source)
);

-- ---------------------------------------------------------------------------
-- Indexes — sized for as-of-race-time rolling feature queries.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fact_race_date        ON fact_race(race_date);
CREATE INDEX IF NOT EXISTS idx_fact_race_track_date  ON fact_race(track_id, race_date);
CREATE INDEX IF NOT EXISTS idx_fact_run_race         ON fact_run(race_id);
CREATE INDEX IF NOT EXISTS idx_fact_run_dog          ON fact_run(dog_id);
CREATE INDEX IF NOT EXISTS idx_fact_run_trainer      ON fact_run(trainer_id);
CREATE INDEX IF NOT EXISTS idx_price_run_captured    ON fact_price_history(run_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_prediction_run        ON fact_prediction(run_id);
CREATE INDEX IF NOT EXISTS idx_bet_run              ON fact_bet(run_id);
CREATE INDEX IF NOT EXISTS idx_name_alias_lookup     ON name_alias(entity_type, raw_name);
