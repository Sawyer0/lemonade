-- 0003_ledger_goal_types.sql
-- LM-25: case goals land in the ledger as `goal_set`, `goal_amended`,
-- `criterion_met`, and `goal_status_changed` entries, and sandboxed test
-- runs record evidence with source `sandbox`. Extends the type and source
-- CHECKs on case_ledger_entries from 0001. Append-only is untouched: the
-- triggers and revokes from 0001 still apply.

ALTER TABLE case_ledger_entries DROP CONSTRAINT case_ledger_entries_type_check;
ALTER TABLE case_ledger_entries ADD CONSTRAINT case_ledger_entries_type_check CHECK (type IN (
    'vin_decoded', 'dtc_read', 'observation', 'frame_captured',
    'test_result', 'hypothesis', 'safety_stop', 'outcome', 'correction',
    'transcript', 'goal_set', 'goal_amended', 'criterion_met',
    'goal_status_changed'
));

ALTER TABLE case_ledger_entries DROP CONSTRAINT case_ledger_entries_source_check;
ALTER TABLE case_ledger_entries ADD CONSTRAINT case_ledger_entries_source_check CHECK (source IN (
    'tech', 'glasses', 'OBD', 'sandbox', 'model', 'NHTSA'
));
