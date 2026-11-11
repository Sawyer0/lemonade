import { injectable, inject } from 'inversify';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
    AppError,
    ErrorCode,
    FixCountSchema,
    SHARED_CONFIG,
    normalizeCaseFacts,
    normalizeFixCount,
    priorFromCounts,
    type CaseFacts,
    type FixCount,
    type IFixCountStore,
    type PriorQueryResult,
} from '@lemonade/core';
import { TYPES } from '../di/types';

interface FixCountRow extends QueryResultRow {
    make: string;
    model: string;
    year_from: number;
    year_to: number;
    engine: string | null;
    dtcs: string[];
    mileage_band: string | null;
    hypothesis: string;
    observation_count: number;
    source_counts: unknown;
}

interface ExistingCountRow extends QueryResultRow {
    id: string;
    observation_count: number;
    source_counts: unknown;
}

// Postgres adapter for the field-fix prior counts (LM-33). The table is
// the durable side of IFixCountStore; the in-memory store is the same
// contract for tests and the seed. Both aggregate through the same pure
// priorFromCounts in packages/core, so the math cannot drift between
// backends.
//
// A row is one (vehicle key, DTC set, mileage band, hypothesis) aggregate.
// recordFix merges into the row: observations and per-source counts add,
// inside a transaction that locks the row, so two concurrent records for
// the same key can never lose an observation. The table is mutable by
// design (unlike the append-only ledger) — see db/migrations/0004.
@injectable()
export class PostgresFixCountStore implements IFixCountStore {
    constructor(@inject(TYPES.PostgresPool) private pool: Pool) {}

    async recordFix(count: FixCount): Promise<void> {
        const normalized = normalizeFixCount(count);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await this.upsertFixCount(client, normalized);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async recordFixes(counts: ReadonlyArray<FixCount>): Promise<void> {
        const normalized = counts.map((count) => normalizeFixCount(count));
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const count of normalized) {
                await this.upsertFixCount(client, count);
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw error;
        } finally {
            client.release();
        }
    }

    async prior(factsInput: CaseFacts): Promise<PriorQueryResult> {
        const facts = normalizeCaseFacts(factsInput);
        // Coarse pre-filter in SQL (vehicle match with '*' wildcard, year
        // overlap); the exact match — engine, mileage band, DTC subset —
        // is fixCountMatches inside priorFromCounts, the same predicate the
        // in-memory store applies.
        const result = await this.pool.query<FixCountRow>(
            `SELECT * FROM fix_counts
             WHERE (make = $1 OR make = '*')
               AND (model = $2 OR model = '*')
               AND year_from <= $3 AND year_to >= $4`,
            [facts.vehicle.make, facts.vehicle.model, facts.vehicle.yearTo, facts.vehicle.yearFrom],
        );
        const counts = result.rows.map((row) => this.rowToFixCount(row));
        return priorFromCounts(counts, facts, SHARED_CONFIG.PRIORS.SMOOTHING_ALPHA);
    }

    async listCounts(): Promise<FixCount[]> {
        const result = await this.pool.query<FixCountRow>(
            'SELECT * FROM fix_counts ORDER BY make, model, year_from, hypothesis',
        );
        return result.rows.map((row) => this.rowToFixCount(row));
    }

    /**
     * Test-only lifecycle: ends the DI-singleton pool. Production code must
     * not call close(); the pool lives as long as the container does.
     */
    async close(): Promise<void> {
        await this.pool.end();
    }

    /**
     * Merges one count into its row inside the caller's transaction: locks
     * the row when it exists (IS NOT DISTINCT FROM matches NULL engine /
     * mileage band as part of the key), otherwise inserts it.
     */
    private async upsertFixCount(client: PoolClient, count: FixCount): Promise<void> {
        const existing = await client.query<ExistingCountRow>(
            `SELECT id, observation_count, source_counts FROM fix_counts
             WHERE make = $1 AND model = $2 AND year_from = $3 AND year_to = $4
               AND engine IS NOT DISTINCT FROM $5
               AND dtcs = $6
               AND mileage_band IS NOT DISTINCT FROM $7
               AND hypothesis = $8
             FOR UPDATE`,
            [
                count.vehicle.make,
                count.vehicle.model,
                count.vehicle.yearFrom,
                count.vehicle.yearTo,
                count.vehicle.engine ?? null,
                count.dtcs,
                count.mileageBand ?? null,
                count.hypothesis,
            ],
        );
        const row = existing.rows[0];
        if (!row) {
            await client.query(
                `INSERT INTO fix_counts
                    (make, model, year_from, year_to, engine, dtcs, mileage_band,
                     hypothesis, observation_count, source_counts)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
                [
                    count.vehicle.make,
                    count.vehicle.model,
                    count.vehicle.yearFrom,
                    count.vehicle.yearTo,
                    count.vehicle.engine ?? null,
                    count.dtcs,
                    count.mileageBand ?? null,
                    count.hypothesis,
                    count.observationCount,
                    JSON.stringify(count.sourceCounts),
                ],
            );
            return;
        }
        const storedSourceCounts = FixCountSchema.shape.sourceCounts.parse(row.source_counts);
        const mergedSourceCounts: Record<string, number> = { ...storedSourceCounts };
        for (const [source, sourceCount] of Object.entries(count.sourceCounts)) {
            mergedSourceCounts[source] = (mergedSourceCounts[source] ?? 0) + sourceCount;
        }
        await client.query(
            `UPDATE fix_counts
             SET observation_count = $1, source_counts = $2::jsonb, updated_at = now()
             WHERE id = $3`,
            [row.observation_count + count.observationCount, JSON.stringify(mergedSourceCounts), row.id],
        );
    }

    private rowToFixCount(row: FixCountRow): FixCount {
        // A stored row that no longer parses is surfaced as a domain error
        // naming the row, not a raw ZodError — the same rule the ledger
        // repository applies to its rows.
        try {
            return normalizeFixCount({
                vehicle: {
                    make: row.make,
                    model: row.model,
                    yearFrom: row.year_from,
                    yearTo: row.year_to,
                    ...(row.engine ? { engine: row.engine } : {}),
                },
                dtcs: row.dtcs,
                ...(row.mileage_band ? { mileageBand: row.mileage_band } : {}),
                hypothesis: row.hypothesis,
                observationCount: row.observation_count,
                sourceCounts: row.source_counts as FixCount['sourceCounts'],
            });
        } catch (error) {
            throw new AppError(
                ErrorCode.INVALID_INPUT,
                `Stored fix count ${row.make} ${row.model} ${row.hypothesis} failed validation: ${error}`,
            );
        }
    }
}
