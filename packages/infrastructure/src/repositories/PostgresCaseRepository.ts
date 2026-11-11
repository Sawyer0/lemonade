import { injectable, inject } from 'inversify';
import { Pool, type QueryResultRow } from 'pg';
import { v4 as uuidv4 } from 'uuid';
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
        const client = await this.pool.connect();
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
            const row = inserted.rows[0];
            if (!row) {
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Ledger insert returned no row');
            }
            return this.rowToEntry(row);
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            this.logger.error('Failed to append ledger entry', error as Error, { caseId });
            throw error;
        } finally {
            client.release();
        }
    }

    async listEntries(caseId: string): Promise<LedgerEntry[]> {
        const result = await this.pool.query<LedgerEntryRow>(
            'SELECT * FROM case_ledger_entries WHERE case_id = $1 ORDER BY sequence ASC',
            [caseId],
        );
        return result.rows.map((row) => this.rowToEntry(row));
    }

    async verifyLedger(caseId: string): Promise<boolean> {
        const entries = await this.listEntries(caseId);
        return verifyLedgerChain(this.hasher, entries);
    }

    async attachSession(caseId: string, sessionId: string): Promise<void> {
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
        const result = await this.pool.query<SessionLinkRow>(
            'SELECT session_id FROM case_sessions WHERE case_id = $1 ORDER BY attached_at ASC',
            [caseId],
        );
        return result.rows.map((row) => row.session_id);
    }

    async close(): Promise<void> {
        await this.pool.end();
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

    private rowToEntry(row: LedgerEntryRow): LedgerEntry {
        return LedgerEntrySchema.parse({
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
        });
    }
}
