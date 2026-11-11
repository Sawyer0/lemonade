-- 0004_fix_counts.sql
-- LM-33: Field-fix prior counts — the Postgres side of IFixCountStore.
--
-- One row per (vehicle key, DTC set, mileage band, hypothesis): how often
-- that cause was the confirmed fix for that vehicle and those codes. The
-- DTC set is stored sorted (normalizeFixCount sorts), so array equality is
-- key equality. Per-source provenance lives in source_counts (JSONB), one
-- entry per PriorSource, so a count can always be traced back to the feed
-- it came from.
--
-- Unlike the case ledger, this table is MUTABLE by design: a new
-- observation merges into its row (observation_count and the per-source
-- counts add), so the app role needs SELECT, INSERT, and UPDATE — never
-- DELETE. There is no append-only trigger here; the audit trail for
-- Lemonade's own outcomes is the ledger itself, and every other source is
-- re-ingestable from its feed.
--
-- The ranking math lives in packages/core (priorFromCounts) and is shared
-- with the in-memory store, so the two backends cannot drift apart.

CREATE TABLE IF NOT EXISTS fix_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year_from INTEGER NOT NULL CHECK (year_from BETWEEN 1900 AND 2100),
    year_to INTEGER NOT NULL CHECK (year_to BETWEEN 1900 AND 2100),
    engine TEXT,
    dtcs TEXT[] NOT NULL DEFAULT '{}',
    mileage_band TEXT CHECK (mileage_band IN ('0-30k', '30-60k', '60-100k', '100-150k', '150k+')),
    hypothesis TEXT NOT NULL,
    observation_count INTEGER NOT NULL CHECK (observation_count >= 0),
    source_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (year_from <= year_to)
);

-- One row per key. NULLs are part of the key (a count with no engine
-- applies to every engine), so the index coalesces them: a plain UNIQUE
-- constraint would treat two NULL engines as distinct rows and let
-- duplicates through.
CREATE UNIQUE INDEX IF NOT EXISTS fix_counts_key_idx ON fix_counts (
    make,
    model,
    year_from,
    year_to,
    COALESCE(engine, ''),
    dtcs,
    COALESCE(mileage_band, ''),
    hypothesis
);

-- The prior() pre-filter: vehicle match with a possible '*' wildcard,
-- plus the year-range overlap.
CREATE INDEX IF NOT EXISTS fix_counts_vehicle_idx ON fix_counts (make, model, year_from, year_to);
