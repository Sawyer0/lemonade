import { injectable, inject } from 'inversify';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
    AppError,
    ErrorCode,
    AppendLedgerEntryInputSchema,
    CaseSchema,
    CreateCaseInputSchema,
    LedgerEntrySchema,
    computeLedgerEntryHash,
    verifyLedgerChain,
    LEDGER_GENESIS_HASH,
    type AppendLedgerEntryInput,
    type Case,
    type CreateCaseInput,
    type ICaseRepository,
    type ILogger,
    type LedgerEntry,
    type LedgerHasher,
} from '@lemonade/core';
import { TYPES } from '../di/types';

interface CaseRow extends QueryResultRow {
    id: string;
    vehicle_id: string;
    user_id: string;
    status: string;
    version: number;
    created_at: Date;
    updated_at: Date;
}

interface CaseVersionRow extends QueryResultRow {
    version: number;
}

interface LedgerEntryRow extends QueryResultRow {
    id: string;
    case_id: string;
    sequence: number;
    type: string;
    actor_kind: string;
    actor_id: string;
    source: string;
    occurred_at: Date;
    payload: unknown;
    previous_hash: string;
    entry_hash: string;
    corrects_entry_id: string | null;
    created_at: Date;
}

interface SessionLinkRow extends QueryResultRow {
    session_id: string;
}

interface CaseIdRow extends QueryResultRow {
    id: string;
}

interface LastEntryRow extends QueryResultRow {
    sequence: number;
    entry_hash: string;
}

// Postgres adapter for the case ledger. Appends are serialized per case by
// locking the case row inside a transaction, so two concurrent appends can
// never claim the same sequence number. The hash chain is the audit spine:
// entries are never updated or deleted (the migration's trigger rejects both),
// and verifyLedger recomputes every hash from the stored content.
@injectable()
export class PostgresCaseRepository implements ICaseRepository {
    constructor(
        @inject(TYPES.PostgresPool) private pool: Pool,
        @inject(TYPES.LedgerHasher) private hasher: LedgerHasher,
        @inject(TYPES.Logger) private logger: ILogger,
    ) {}

    async createCase(input: CreateCaseInput): Promise<Case> {
        const parsed = CreateCaseInputSchema.parse(input);
        const now = new Date();
        const result = await this.pool.query<CaseRow>(
            `INSERT INTO cases (id, vehicle_id, user_id, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'open', $4, $4) RETURNING *`,
            [uuidv4(), parsed.vehicleId, parsed.userId, now],
        );
        const row = result.rows[0];
        if (!row) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Case insert returned no row');
        }
        return this.rowToCase(row);
    }

    async findCaseById(id: string): Promise<Case | null> {
        this.validateCaseId(id);
        const result = await this.pool.query<CaseRow>('SELECT * FROM cases WHERE id = $1', [id]);
        const row = result.rows[0];
        return row ? this.rowToCase(row) : null;
    }

    async findCasesByVehicleId(vehicleId: string): Promise<Case[]> {
        const result = await this.pool.query<CaseRow>(
            'SELECT * FROM cases WHERE vehicle_id = $1 ORDER BY created_at DESC',
            [vehicleId],
        );
        return result.rows.map((row) => this.rowToCase(row));
    }

    async appendEntry(caseId: string, input: AppendLedgerEntryInput): Promise<LedgerEntry> {
        const parsed = AppendLedgerEntryInputSchema.parse(input);
        this.validateCaseId(caseId);
        const client = await this.pool.connect();
        let insertedRow: LedgerEntryRow | undefined;
        try {
            await client.query('BEGIN');
            await this.lockOpenCase(client, caseId);
            // LM-17: every ledger append advances the case version by one, so
            // a run that started before this append finds its read version
            // stale when it commits.
            await client.query('UPDATE cases SET version = version + 1, updated_at = now() WHERE id = $1', [caseId]);
            if (parsed.type === 'correction') {
                const original = await client.query<CaseIdRow>(
                    'SELECT id FROM case_ledger_entries WHERE id = $1 AND case_id = $2',
                    [parsed.correctsEntryId, caseId],
                );
                if (original.rowCount === 0) {
                    throw new AppError(
                        ErrorCode.INVALID_INPUT,
                        `Correction references unknown entry ${parsed.correctsEntryId} in case ${caseId}`,
                    );
                }
            }
            insertedRow = await this.insertEntry(client, caseId, parsed);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (
                error instanceof AppError &&
                (error.code === ErrorCode.RESOURCE_NOT_FOUND ||
                    error.code === ErrorCode.INVALID_INPUT ||
                    error.code === ErrorCode.RESOURCE_ALREADY_EXISTS)
            ) {
                // Expected client errors (unknown case, bad correction
                // reference, append to a closed case): a warning, not an error log.
                this.logger.warn('Rejected ledger append', { caseId, code: error.code });
            } else {
                this.logger.error('Failed to append ledger entry', error as Error, { caseId });
            }
            throw error;
        } finally {
            client.release();
        }
        // Mapped after COMMIT: a parse failure here must not report the
        // insert as failed — and a retry must not append a duplicate.
        if (!insertedRow) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Ledger insert returned no row');
        }
        return this.ledgerEntryFromRow(insertedRow);
    }

    async closeCase(
        caseId: string,
        input: AppendLedgerEntryInput,
    ): Promise<{ closedCase: Case; outcomeEntry: LedgerEntry }> {
        const parsed = AppendLedgerEntryInputSchema.parse(input);
        this.validateCaseId(caseId);
        if (parsed.type !== 'outcome') {
            throw new AppError(ErrorCode.INVALID_INPUT, `closeCase requires an outcome entry, received ${parsed.type}`);
        }
        const client = await this.pool.connect();
        let outcomeRow: LedgerEntryRow | undefined;
        let closedRow: CaseRow | undefined;
        try {
            await client.query('BEGIN');
            // Locks the case row, so a concurrent append and a concurrent
            // close cannot interleave: the outcome and the status flip land
            // in the same transaction or not at all.
            await this.lockOpenCase(client, caseId);
            outcomeRow = await this.insertEntry(client, caseId, parsed);
            const updated = await client.query<CaseRow>(
                `UPDATE cases SET status = 'closed', updated_at = $2 WHERE id = $1 RETURNING *`,
                [caseId, new Date()],
            );
            closedRow = updated.rows[0];
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (
                error instanceof AppError &&
                (error.code === ErrorCode.RESOURCE_NOT_FOUND ||
                    error.code === ErrorCode.INVALID_INPUT ||
                    error.code === ErrorCode.RESOURCE_ALREADY_EXISTS)
            ) {
                this.logger.warn('Rejected case close', { caseId, code: error.code });
            } else {
                this.logger.error('Failed to close case', error as Error, { caseId });
            }
            throw error;
        } finally {
            client.release();
        }
        if (!outcomeRow || !closedRow) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Case close returned no row');
        }
        return { closedCase: this.rowToCase(closedRow), outcomeEntry: this.ledgerEntryFromRow(outcomeRow) };
    }

    async findConfirmedOutcomes(vehicleId: string): Promise<LedgerEntry[]> {
        const result = await this.pool.query<LedgerEntryRow>(
            `SELECT e.* FROM case_ledger_entries e
             JOIN cases c ON c.id = e.case_id
             WHERE c.vehicle_id = $1
               AND e.type = 'outcome'
               AND (e.payload ->> 'confirmed')::boolean IS TRUE
             ORDER BY e.created_at DESC, e.sequence DESC`,
            [vehicleId],
        );
        return result.rows.map((row) => this.ledgerEntryFromRow(row));
    }

    async listEntries(caseId: string): Promise<LedgerEntry[]> {
        this.validateCaseId(caseId);
        const rows = await this.fetchLedgerRows(caseId);
        return rows.map((row) => this.ledgerEntryFromRow(row));
    }

    async verifyLedger(caseId: string): Promise<boolean> {
        this.validateCaseId(caseId);
        const rows = await this.fetchLedgerRows(caseId);
        const entries: LedgerEntry[] = [];
        for (const row of rows) {
            // A row that no longer parses — a tamper that breaks the Zod
            // shape, not just the hash — fails verification instead of
            // throwing: verification answers a yes/no question.
            const parsed = LedgerEntrySchema.safeParse(this.ledgerEntryInputFromRow(row));
            if (!parsed.success) {
                return false;
            }
            entries.push(parsed.data);
        }
        return verifyLedgerChain(this.hasher, entries);
    }

    async attachSession(caseId: string, sessionId: string): Promise<void> {
        this.validateCaseId(caseId);
        if (!sessionId) {
            throw new AppError(ErrorCode.INVALID_INPUT, 'sessionId must not be empty');
        }
        const caseResult = await this.pool.query<CaseIdRow>('SELECT id FROM cases WHERE id = $1', [caseId]);
        if (caseResult.rowCount === 0) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
        }
        await this.pool.query(
            'INSERT INTO case_sessions (case_id, session_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [caseId, sessionId],
        );
    }

    async advanceCaseVersion(caseId: string, expectedVersion: number): Promise<number> {
        this.validateCaseId(caseId);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                `expectedVersion must be a positive integer: ${expectedVersion}`,
            );
        }
        // The version predicate is the guard: the UPDATE touches the row only
        // when the stored version still equals the version the run read, so
        // two concurrent commits can never both succeed.
        const updated = await this.pool.query<CaseVersionRow>(
            'UPDATE cases SET version = version + 1, updated_at = now() WHERE id = $1 AND version = $2 RETURNING version',
            [caseId, expectedVersion],
        );
        const row = updated.rows[0];
        if (row) {
            return row.version;
        }
        const existing = await this.findCaseById(caseId);
        if (!existing) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
        }
        throw new AppError(
            ErrorCode.VERSION_CONFLICT,
            `Case ${caseId} changed since this run started (read version ${expectedVersion}, current version ${existing.version}); refusing the stale write`,
        );
    }

    async listSessions(caseId: string): Promise<string[]> {
        this.validateCaseId(caseId);
        const result = await this.pool.query<SessionLinkRow>(
            'SELECT session_id FROM case_sessions WHERE case_id = $1 ORDER BY attached_at ASC, session_id ASC',
            [caseId],
        );
        return result.rows.map((row) => row.session_id);
    }

    /**
     * Test-only lifecycle: ends the DI-singleton pool. Production code must
     * not call close(); the pool lives as long as the container does.
     */
    async close(): Promise<void> {
        await this.pool.end();
    }

    /**
     * Locks the case row and rejects the write when the case does not exist
     * (404) or is already closed (409): closed cases are read-only, so no
     * entry — outcome or otherwise — may be appended after the close.
     */
    private async lockOpenCase(client: PoolClient, caseId: string): Promise<void> {
        const caseResult = await client.query<{ status: string }>('SELECT status FROM cases WHERE id = $1 FOR UPDATE', [
            caseId,
        ]);
        if (caseResult.rowCount === 0) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
        }
        if (caseResult.rows[0]?.status === 'closed') {
            throw new AppError(ErrorCode.RESOURCE_ALREADY_EXISTS, `Case is already closed: ${caseId}`);
        }
    }

    /**
     * Appends one entry inside the caller's transaction: claims the next
     * sequence, chains the hash, and inserts the row. The caller owns
     * BEGIN/COMMIT, so appendEntry and closeCase share this without ever
     * claiming the same sequence twice.
     */
    private async insertEntry(
        client: PoolClient,
        caseId: string,
        parsed: AppendLedgerEntryInput,
    ): Promise<LedgerEntryRow> {
        const last = await client.query<LastEntryRow>(
            'SELECT sequence, entry_hash FROM case_ledger_entries WHERE case_id = $1 ORDER BY sequence DESC LIMIT 1',
            [caseId],
        );
        const lastRow = last.rows[0];
        const sequence = lastRow ? lastRow.sequence + 1 : 1;
        const previousHash = lastRow ? lastRow.entry_hash : LEDGER_GENESIS_HASH;
        const entryHash = computeLedgerEntryHash(this.hasher, {
            caseId,
            sequence,
            type: parsed.type,
            actor: parsed.actor,
            source: parsed.source,
            occurredAt: parsed.occurredAt,
            payload: parsed.payload,
            previousHash,
            ...(parsed.type === 'correction' ? { correctsEntryId: parsed.correctsEntryId } : {}),
        });
        const inserted = await client.query<LedgerEntryRow>(
            `INSERT INTO case_ledger_entries
                (id, case_id, sequence, type, actor_kind, actor_id, source, occurred_at,
                 payload, previous_hash, entry_hash, corrects_entry_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
            [
                uuidv4(),
                caseId,
                sequence,
                parsed.type,
                parsed.actor.kind,
                parsed.actor.id,
                parsed.source,
                parsed.occurredAt,
                JSON.stringify(parsed.payload),
                previousHash,
                entryHash,
                parsed.type === 'correction' ? parsed.correctsEntryId : null,
                new Date(),
            ],
        );
        const row = inserted.rows[0];
        if (!row) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Ledger insert returned no row');
        }
        return row;
    }

    private validateCaseId(caseId: string): void {
        if (!z.string().uuid().safeParse(caseId).success) {
            throw new AppError(ErrorCode.INVALID_INPUT, `caseId must be a valid UUID: ${caseId}`);
        }
    }

    private async fetchLedgerRows(caseId: string): Promise<LedgerEntryRow[]> {
        const result = await this.pool.query<LedgerEntryRow>(
            'SELECT * FROM case_ledger_entries WHERE case_id = $1 ORDER BY sequence ASC',
            [caseId],
        );
        return result.rows;
    }

    private rowToCase(row: CaseRow): Case {
        return CaseSchema.parse({
            id: row.id,
            vehicleId: row.vehicle_id,
            userId: row.user_id,
            status: row.status,
            version: row.version,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    }

    private ledgerEntryInputFromRow(row: LedgerEntryRow): Record<string, unknown> {
        return {
            id: row.id,
            caseId: row.case_id,
            sequence: row.sequence,
            type: row.type,
            actor: { kind: row.actor_kind, id: row.actor_id },
            source: row.source,
            occurredAt: row.occurred_at,
            payload: row.payload,
            previousHash: row.previous_hash,
            entryHash: row.entry_hash,
            ...(row.corrects_entry_id ? { correctsEntryId: row.corrects_entry_id } : {}),
            createdAt: row.created_at,
        };
    }

    private ledgerEntryFromRow(row: LedgerEntryRow): LedgerEntry {
        const parsed = LedgerEntrySchema.safeParse(this.ledgerEntryInputFromRow(row));
        if (!parsed.success) {
            // A stored row that no longer parses is surfaced as a domain
            // error naming the entry, not a raw ZodError. Verification
            // (verifyLedger) treats the same rows as a failed check.
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                `Stored ledger entry ${row.id} (sequence ${row.sequence}) failed validation: ${parsed.error.issues
                    .map((issue) => issue.message)
                    .join('; ')}`,
            );
        }
        return parsed.data;
    }
}
