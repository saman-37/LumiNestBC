-- LuminestBC schema. Owner: Backend (Person 2).
-- Idempotent: safe to run more than once (docker init, scripts/import_shelters.py --schema, tests).
-- Privacy rule: nothing here describes a person being sheltered. Holds store only the
-- outreach worker's name and organisation.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS shelters (
    id              TEXT PRIMARY KEY,                 -- slug, e.g. shelter-03
    name            TEXT NOT NULL,
    address         TEXT,                             -- NULL for DV shelters
    lat             DOUBLE PRECISION,                 -- NULL for DV shelters
    lng             DOUBLE PRECISION,
    capacity        INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
    open_beds       INTEGER NOT NULL DEFAULT 0 CONSTRAINT open_beds_not_negative CHECK (open_beds >= 0),
    is_full         BOOLEAN NOT NULL DEFAULT FALSE,
    women_only      BOOLEAN NOT NULL DEFAULT FALSE,
    youth           BOOLEAN NOT NULL DEFAULT FALSE,
    families        BOOLEAN NOT NULL DEFAULT FALSE,
    pets_ok         BOOLEAN NOT NULL DEFAULT FALSE,
    accessible      BOOLEAN NOT NULL DEFAULT FALSE,
    couples         BOOLEAN NOT NULL DEFAULT FALSE,
    is_dv           BOOLEAN NOT NULL DEFAULT FALSE,
    dv_phone        TEXT,                             -- the only contact shown for DV shelters
    staff_phone     TEXT,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now() -- last time STAFF confirmed the count
);

CREATE TABLE IF NOT EXISTS tags (
    id          TEXT PRIMARY KEY,                     -- e.g. shelter-03-freed
    shelter_id  TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
    action      TEXT NOT NULL CHECK (action IN ('freed', 'filled', 'full', 'arrive')),
    secret      TEXT NOT NULL,
    last_tap_at TIMESTAMPTZ,
    UNIQUE (shelter_id, action)
);

CREATE TABLE IF NOT EXISTS holds (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shelter_id  TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
    worker_name TEXT NOT NULL,
    worker_org  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'arrived', 'expired', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS holds_active_idx ON holds (shelter_id, expires_at) WHERE status = 'active';

-- Every tap_id the server has seen, so a repeated POST is ignored.
-- shelter_id/action/delta/undone_at are kept so POST /api/undo can reverse the tap.
CREATE TABLE IF NOT EXISTS processed_taps (
    tap_id     TEXT PRIMARY KEY,
    shelter_id TEXT NOT NULL REFERENCES shelters(id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    delta      INTEGER NOT NULL DEFAULT 0,            -- change actually applied (0 if ignored)
    undone_at  TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_events (
    time            TIMESTAMPTZ NOT NULL DEFAULT now(),
    shelter_id      TEXT NOT NULL,
    delta           INTEGER NOT NULL,
    open_beds_after INTEGER NOT NULL,
    source          TEXT NOT NULL
                    CHECK (source IN ('tap', 'sms', 'hold', 'arrival', 'expiry', 'undo'))
);
SELECT create_hypertable('availability_events', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS availability_events_shelter_idx ON availability_events (shelter_id, time DESC);
