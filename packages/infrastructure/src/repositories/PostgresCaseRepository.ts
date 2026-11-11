import { injectable, inject } from 'inversify';
import { Pool, type QueryResultRow } from 'pg';
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
    created_at: Date;
    updated_at: Date;
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
            const caseResult = await client.query<CaseIdRow>('SELECT id FROM cases WHERE id = $1 FOR UPDATE', [caseId]);
            if (caseResult.rowCount === 0) {
                throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, `Case not found: ${caseId}`);
            }
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
            await client.query('COMMIT');
            insertedRow = inserted.rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (
                error instanceof AppError &&
                (error.code === ErrorCode.RESOURCE_NOT_FOUND || error.code === ErrorCode.INVALID_INPUT)
            ) {
                // Expected client errors (unknown case, bad correction
                // reference): a warning, not an error log.
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
