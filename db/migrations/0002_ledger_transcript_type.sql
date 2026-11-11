-- 0002_ledger_transcript_type.sql
-- LM-39: voice transcripts land in the case ledger as `transcript` entries
-- (one per turn, role + text + voice provider id; audio is never stored).
-- Extends the type CHECK on case_ledger_entries from 0001. Append-only is
-- untouched: the triggers and revokes from 0001 still apply.

ALTER TABLE case_ledger_entries DROP CONSTRAINT case_ledger_entries_type_check;
ALTER TABLE case_ledger_entries ADD CONSTRAINT case_ledger_entries_type_check CHECK (type IN (
    'vin_decoded', 'dtc_read', 'observation', 'frame_captured',
    'test_result', 'hypothesis', 'safety_stop', 'outcome', 'correction',
    'transcript'
));
