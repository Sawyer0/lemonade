-- 0001_case_ledger.sql
-- LM-01: Case aggregate with an append-only evidence ledger.
--
-- The ledger lives in Postgres (fleet queries, exports, and the counts behind
-- field-fix priors, LM-33). Firestore stays for realtime session state;
-- sessions link to a case through the session's caseId and case_sessions.
--
-- Append-only is enforced two ways:
--   1. Triggers reject every UPDATE, DELETE, and TRUNCATE on case_ledger_entries.
--   2. UPDATE/DELETE/TRUNCATE are revoked from PUBLIC (the app role must be
--      granted SELECT and INSERT only — see db/migrations/README.md).
-- Mistakes are fixed by appending a `correction` entry that references the
-- original (corrects_entry_id). Nothing is edited.
-- Photos and frames live in object storage; the ledger stores their hash and
-- a reference (payload JSONB), never the bytes.

CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY,
    vehicle_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_ledger_entries (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases (id),
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'vin_decoded', 'dtc_read', 'observation', 'frame_captured',
        'test_result', 'hypothesis', 'safety_stop', 'outcome', 'correction'
    )),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'agent')),
    actor_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('tech', 'glasses', 'OBD', 'model', 'NHTSA')),
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    previous_hash TEXT NOT NULL CHECK (previous_hash ~ '^[0-9a-f]{64}$'),
    entry_hash TEXT NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
    corrects_entry_id UUID REFERENCES case_ledger_entries (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (case_id, sequence)
);

CREATE TABLE IF NOT EXISTS case_sessions (
    case_id UUID NOT NULL REFERENCES cases (id),
    session_id TEXT NOT NULL,
    attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, session_id)
);

CREATE INDEX IF NOT EXISTS case_ledger_entries_case_id_idx ON case_ledger_entries (case_id, sequence);
CREATE INDEX IF NOT EXISTS cases_vehicle_id_idx ON cases (vehicle_id);

CREATE OR REPLACE FUNCTION reject_ledger_entry_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'case_ledger_entries is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_ledger_entries_append_only ON case_ledger_entries;
CREATE TRIGGER case_ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON case_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION reject_ledger_entry_mutation();

-- TRUNCATE takes a statement-level trigger, not a row-level one.
DROP TRIGGER IF EXISTS case_ledger_entries_append_only_truncate ON case_ledger_entries;
CREATE TRIGGER case_ledger_entries_append_only_truncate
    BEFORE TRUNCATE ON case_ledger_entries
    FOR EACH STATEMENT EXECUTE FUNCTION reject_ledger_entry_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON case_ledger_entries FROM PUBLIC;
