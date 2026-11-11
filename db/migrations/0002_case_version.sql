-- 0002_case_version.sql
-- LM-17: optimistic-concurrency version on the case aggregate.
--
-- Every ledger append and every committed reasoner run advances the version
-- by one; a run writes with the version it read, and a stale version refuses
-- the write (see PostgresCaseRepository.advanceCaseVersion). Existing cases
-- start at 1, which is the version a case has before anything has advanced
-- it. Apply after 0001_case_ledger.sql, in filename order.
ALTER TABLE cases ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);
