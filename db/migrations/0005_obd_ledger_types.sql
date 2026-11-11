-- 0005_obd_ledger_types.sql
-- LM-03: OBD-II capture lands in the case ledger as typed events.
-- `obd_scan` is the one-tap full scan (codes in every state, freeze frame,
-- Mode 06, readiness, VIN); `obd_fault_window` is a saved 60 s-before /
-- 15 s-after window; `guided_test` is a guided-test outcome against its
-- expected range; `verify_fix` is the clear-codes / drive-cycle / rescan
-- verdict. Extends the type CHECK on case_ledger_entries from 0003, keeping
-- the LM-25 goal types (`goal_set`, `goal_amended`, `criterion_met`,
-- `goal_status_changed`) alongside the new OBD types: rewriting the CHECK
-- without them would reject every goal ledger insert.
-- Append-only is untouched: the triggers and revokes from 0001 still apply.

ALTER TABLE case_ledger_entries DROP CONSTRAINT case_ledger_entries_type_check;
ALTER TABLE case_ledger_entries ADD CONSTRAINT case_ledger_entries_type_check CHECK (type IN (
    'vin_decoded', 'dtc_read', 'observation', 'frame_captured',
    'test_result', 'hypothesis', 'safety_stop', 'outcome', 'correction',
    'transcript', 'goal_set', 'goal_amended', 'criterion_met',
    'goal_status_changed', 'obd_scan', 'obd_fault_window', 'guided_test',
    'verify_fix'
));
