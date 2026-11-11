import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { v4 as uuidv4 } from 'uuid';
import { NodeCryptoLedgerHasher } from '../../crypto/NodeCryptoLedgerHasher';
import { PostgresCaseRepository } from '../PostgresCaseRepository';
import type { ILogger } from '@lemonade/core';

// The ledger's Postgres behavior can only be proven against a real database:
// the append-only trigger, the sequence serialization, and hash-chain
// verification. testcontainers gives each run a throwaway Postgres; Docker is
// available on the CI runners. There is no Docker in this dev VM, so this
// file cannot run locally there — CI is the check.
const silentLogger: ILogger = {
    info: () => undefined,
    error: () => undefined,
    warn: () => undefined,
    debug: () => undefined,
};

const actor = { kind: 'user', id: 'tech-123' } as const;
const occurredAt = new Date('2026-11-11T10:00:00.000Z');

describe('PostgresCaseRepository', () => {
    let container: StartedPostgreSqlContainer;
    let pool: Pool;
    let repository: PostgresCaseRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer('postgres:16-alpine').start();
        pool = new Pool({ connectionString: container.getConnectionUri() });
        const migration = readFileSync(path.resolve(process.cwd(), 'db/migrations/0001_case_ledger.sql'), 'utf8');
        await pool.query(migration);
        repository = new PostgresCaseRepository(pool, new NodeCryptoLedgerHasher(), silentLogger);
    }, 180000);

    afterAll(async () => {
        await repository.close();
        await container.stop();
    });

    it('creates a case and finds it by id and by vehicle', async () => {
        const created = await repository.createCase({ vehicleId: 'vehicle-1', userId: 'user-1' });
        expect(created.id).toBeTruthy();
        expect(created.status).toBe('open');

        const found = await repository.findCaseById(created.id);
        expect(found?.vehicleId).toBe('vehicle-1');

        const byVehicle = await repository.findCasesByVehicleId('vehicle-1');
        expect(byVehicle.map((entry) => entry.id)).toContain(created.id);

        expect(await repository.findCaseById(uuidv4())).toBeNull();
    });

    it('appends entries with sequential numbers and a verifiable chain', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-2', userId: 'user-1' });
        const first = await repository.appendEntry(caseRecord.id, {
            type: 'vin_decoded',
            actor,
            source: 'tech',
            occurredAt,
            payload: { vin: '1HGCM82633A004352', year: 2003, make: 'Honda', model: 'Accord' },
        });
        expect(first.sequence).toBe(1);
        const second = await repository.appendEntry(caseRecord.id, {
            type: 'dtc_read',
            actor,
            source: 'OBD',
            occurredAt,
            payload: { codes: ['P0300'] },
        });
        expect(second.sequence).toBe(2);
        expect(second.previousHash).toBe(first.entryHash);

        const entries = await repository.listEntries(caseRecord.id);
        expect(entries.map((entry) => entry.sequence)).toEqual([1, 2]);
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
    });

    it('rejects an append to a missing case', async () => {
        await expect(
            repository.appendEntry(uuidv4(), {
                type: 'observation',
                actor,
                source: 'tech',
                occurredAt,
                payload: { text: 'No case for this one' },
            }),
        ).rejects.toThrow('Case not found');
    });

    it('rejects a payload that does not match its event type', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-3', userId: 'user-1' });
        await expect(
            repository.appendEntry(caseRecord.id, {
                type: 'hypothesis',
                actor,
                source: 'model',
                occurredAt,
                payload: { codes: ['P0300'] },
            } as never),
        ).rejects.toThrow();
    });

    it('fixes a mistake by appending a correction that references the original', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-4', userId: 'user-1' });
        const original = await repository.appendEntry(caseRecord.id, {
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Misfire on cylinder 1' },
        });
        const correction = await repository.appendEntry(caseRecord.id, {
            type: 'correction',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Cylinder was 3, not 1' },
            correctsEntryId: original.id,
        });
        expect(correction.correctsEntryId).toBe(original.id);
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);

        await expect(
            repository.appendEntry(caseRecord.id, {
                type: 'correction',
                actor,
                source: 'tech',
                occurredAt,
                payload: { text: 'References nothing' },
                correctsEntryId: uuidv4(),
            }),
        ).rejects.toThrow('unknown entry');
    });

    it('rejects UPDATE and DELETE on ledger entries', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-5', userId: 'user-1' });
        const entry = await repository.appendEntry(caseRecord.id, {
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Do not edit me' },
        });
        await expect(
            pool.query('UPDATE case_ledger_entries SET payload = $1 WHERE id = $2', [
                JSON.stringify({ text: 'Edited' }),
                entry.id,
            ]),
        ).rejects.toThrow('append-only');
        await expect(pool.query('DELETE FROM case_ledger_entries WHERE id = $1', [entry.id])).rejects.toThrow(
            'append-only',
        );
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
    });

    it('detects a tampered entry through hash-chain verification', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-6', userId: 'user-1' });
        const entry = await repository.appendEntry(caseRecord.id, {
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Original reading' },
        });
        try {
            await pool.query('ALTER TABLE case_ledger_entries DISABLE TRIGGER case_ledger_entries_append_only');
            await pool.query('UPDATE case_ledger_entries SET payload = $1 WHERE id = $2', [
                JSON.stringify({ text: 'Forged reading' }),
                entry.id,
            ]);
        } finally {
            await pool.query('ALTER TABLE case_ledger_entries ENABLE TRIGGER case_ledger_entries_append_only');
        }
        expect(await repository.verifyLedger(caseRecord.id)).toBe(false);
    });

    it('attaches sessions to a case and lists them', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-7', userId: 'user-1' });
        await repository.attachSession(caseRecord.id, 'session-a');
        await repository.attachSession(caseRecord.id, 'session-b');
        await repository.attachSession(caseRecord.id, 'session-a');
        expect(await repository.listSessions(caseRecord.id)).toEqual(['session-a', 'session-b']);

        await expect(repository.attachSession(uuidv4(), 'session-c')).rejects.toThrow('Case not found');
    });

    it('gives concurrent appends distinct sequence numbers', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-8', userId: 'user-1' });
        const appended = await Promise.all(
            Array.from({ length: 5 }, (_, index) =>
                repository.appendEntry(caseRecord.id, {
                    type: 'observation',
                    actor,
                    source: 'tech',
                    occurredAt,
                    payload: { text: `Concurrent observation ${index}` },
                }),
            ),
        );
        const sequences = appended.map((entry) => entry.sequence).sort((a, b) => a - b);
        expect(sequences).toEqual([1, 2, 3, 4, 5]);
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
    });
});
