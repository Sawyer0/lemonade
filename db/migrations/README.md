# Database migrations

Plain SQL files, applied in filename order. No migration runner is wired up
yet; apply them with `psql` against the case-ledger database:

```sh
psql "$LEMONADE_CASE_LEDGER_DATABASE_URL" -f db/migrations/0001_case_ledger.sql
psql "$LEMONADE_CASE_LEDGER_DATABASE_URL" -f db/migrations/0002_ledger_transcript_type.sql
psql "$LEMONADE_CASE_LEDGER_DATABASE_URL" -f db/migrations/0002_case_version.sql
psql "$LEMONADE_CASE_LEDGER_DATABASE_URL" -f db/migrations/0003_ledger_goal_types.sql
```

The repository test (`PostgresCaseRepository.test.ts`) applies the migrations
itself against a throwaway container, so no local database is needed to run
the tests.

## Privileges

The application role must be able to read and append, nothing else:

```sql
GRANT SELECT, INSERT ON cases, case_ledger_entries, case_sessions TO <app_role>;
GRANT UPDATE (version, updated_at) ON cases TO <app_role>;
```

Do not grant UPDATE or DELETE on `case_ledger_entries` to the app role. The
append-only trigger in `0001_case_ledger.sql` rejects mutations even if a
grant is added by mistake, and the migration revokes UPDATE/DELETE from
PUBLIC as well.
