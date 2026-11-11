import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
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
        for (const migration of [
            '0001_case_ledger.sql',
            '0002_ledger_transcript_type.sql',
            '0002_case_version.sql',
            '0003_ledger_goal_types.sql',
        ]) {
            const sql = readFileSync(path.resolve(process.cwd(), `db/migrations/${migration}`), 'utf8');
            await pool.query(sql);
        }
        repository = new PostgresCaseRepository(pool, new NodeCryptoLedgerHasher(), silentLogger);
    }, 180000);

    afterAll(async () => {
        // Guarded: if beforeAll failed, repository/container were never
        // assigned, and an unconditional close would mask the real failure.
        if (repository) await repository.close();
        if (container) await container.stop();
    });

    it('creates a case and finds it by id and by vehicle', async () => {
        const created = await repository.createCase({ vehicleId: 'vehicle-1', userId: 'user-1' });
        expect(created.id).toBeTruthy();
        expect(created.status).toBe('open');
        expect(created.version).toBe(1);

        const found = await repository.findCaseById(created.id);
        expect(found?.vehicleId).toBe('vehicle-1');
        expect(found?.version).toBe(1);

        const byVehicle = await repository.findCasesByVehicleId('vehicle-1');
        expect(byVehicle.map((entry) => entry.id)).toContain(created.id);

        expect(await repository.findCaseById(uuidv4())).toBeNull();
    });

    it('advances the case version on every ledger append', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-10', userId: 'user-1' });
        expect(caseRecord.version).toBe(1);
        await repository.appendEntry(caseRecord.id, {
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'First reading' },
        });
        expect((await repository.findCaseById(caseRecord.id))?.version).toBe(2);
        await repository.appendEntry(caseRecord.id, {
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Second reading' },
        });
        expect((await repository.findCaseById(caseRecord.id))?.version).toBe(3);
    });

    it('advances the version only when the run read the current one', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-11', userId: 'user-1' });
        expect(await repository.advanceCaseVersion(caseRecord.id, 1)).toBe(2);
        expect((await repository.findCaseById(caseRecord.id))?.version).toBe(2);

        await expect(repository.advanceCaseVersion(caseRecord.id, 1)).rejects.toThrow(
            'read version 1, current version 2',
        );
        expect((await repository.findCaseById(caseRecord.id))?.version).toBe(2);

        await expect(repository.advanceCaseVersion(uuidv4(), 1)).rejects.toThrow('Case not found');
        await expect(repository.advanceCaseVersion(caseRecord.id, 0)).rejects.toThrow('positive integer');
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

    it('appends transcript entries with the voice provider recorded', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-5', userId: 'user-1' });
        const entry = await repository.appendEntry(caseRecord.id, {
            type: 'transcript',
            actor: { kind: 'agent', id: 'master-tech' },
            source: 'model',
            occurredAt,
            payload: { role: 'assistant', text: 'Check the brake pads first.', provider: 'grok' },
        });
        expect(entry.sequence).toBe(1);

        const entries = await repository.listEntries(caseRecord.id);
        expect(entries).toHaveLength(1);
        expect(entries[0].type).toBe('transcript');
        expect(entries[0].payload).toEqual({
            role: 'assistant',
            text: 'Check the brake pads first.',
            provider: 'grok',
        });
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
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
        ).rejects.toThrowError(ZodError);
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

    it('returns false, not an error, when a tampered row no longer parses', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-9', userId: 'user-1' });
        const entry = await repository.appendEntry(caseRecord.id, {
            type: 'hypothesis',
            actor,
            source: 'model',
            occurredAt,
            payload: { text: 'Head gasket leak', confidence: 0.7 },
        });
        try {
            await pool.query('ALTER TABLE case_ledger_entries DISABLE TRIGGER case_ledger_entries_append_only');
            // A schema-invalid tamper: confidence outside 0-1 breaks the Zod
            // shape, not just the hash.
            await pool.query('UPDATE case_ledger_entries SET payload = $1 WHERE id = $2', [
                JSON.stringify({ text: 'Head gasket leak', confidence: 2 }),
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

    // LM-05: closing a case appends the outcome entry and flips the status
    // in one transaction; afterwards the ledger is read-only.
    it('closes a case with a confirmed outcome and keeps the chain verifiable', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-10', userId: 'user-1' });
        await repository.appendEntry(caseRecord.id, {
            type: 'dtc_read',
            actor,
            source: 'OBD',
            occurredAt,
            payload: { codes: ['P0300'] },
        });
        const { closedCase, outcomeEntry } = await repository.closeCase(caseRecord.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Replaced radiator hose',
                partsReplaced: ['Radiator hose'],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        });
        expect(closedCase.status).toBe('closed');
        expect(outcomeEntry.type).toBe('outcome');
        expect(outcomeEntry.sequence).toBe(2);
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
        expect((await repository.findCaseById(caseRecord.id))?.status).toBe('closed');
    });

    it('closes a case with an unconfirmed outcome', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-11', userId: 'user-1' });
        const { closedCase, outcomeEntry } = await repository.closeCase(caseRecord.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Tightened hose clamp',
                partsReplaced: [],
                codesCleared: false,
                symptomGone: false,
                retestPassed: false,
                confirmed: false,
            },
        });
        expect(closedCase.status).toBe('closed');
        expect(outcomeEntry.type).toBe('outcome');
        expect(await repository.verifyLedger(caseRecord.id)).toBe(true);
    });

    it('rejects a second close and leaves the ledger untouched', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-12', userId: 'user-1' });
        await repository.closeCase(caseRecord.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Replaced radiator hose',
                partsReplaced: [],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        });
        await expect(
            repository.closeCase(caseRecord.id, {
                type: 'outcome',
                actor,
                source: 'tech',
                occurredAt,
                payload: {
                    repairPerformed: 'Replaced radiator hose again',
                    partsReplaced: [],
                    codesCleared: true,
                    symptomGone: true,
                    retestPassed: true,
                    confirmed: true,
                },
            }),
        ).rejects.toThrow('already closed');
        expect((await repository.listEntries(caseRecord.id)).length).toBe(1);
    });

    it('rejects a close with a non-outcome entry', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-13', userId: 'user-1' });
        await expect(
            repository.closeCase(caseRecord.id, {
                type: 'observation',
                actor,
                source: 'tech',
                occurredAt,
                payload: { text: 'Not an outcome' },
            }),
        ).rejects.toThrow('requires an outcome entry');
        expect((await repository.findCaseById(caseRecord.id))?.status).toBe('open');
    });

    it('rejects a close of a missing case', async () => {
        await expect(
            repository.closeCase(uuidv4(), {
                type: 'outcome',
                actor,
                source: 'tech',
                occurredAt,
                payload: {
                    repairPerformed: 'Replaced radiator hose',
                    partsReplaced: [],
                    codesCleared: true,
                    symptomGone: true,
                    retestPassed: true,
                    confirmed: true,
                },
            }),
        ).rejects.toThrow('Case not found');
    });

    it('rejects appends to a closed case', async () => {
        const caseRecord = await repository.createCase({ vehicleId: 'vehicle-14', userId: 'user-1' });
        await repository.closeCase(caseRecord.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Replaced radiator hose',
                partsReplaced: [],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        });
        await expect(
            repository.appendEntry(caseRecord.id, {
                type: 'observation',
                actor,
                source: 'tech',
                occurredAt,
                payload: { text: 'One more note after the close' },
            }),
        ).rejects.toThrow('already closed');
        expect((await repository.listEntries(caseRecord.id)).length).toBe(1);
    });

    it('lists only confirmed outcomes for a vehicle, newest first', async () => {
        const vehicleId = 'vehicle-15';
        const confirmedCase = await repository.createCase({ vehicleId, userId: 'user-1' });
        const unconfirmedCase = await repository.createCase({ vehicleId, userId: 'user-1' });
        const otherVehicleCase = await repository.createCase({ vehicleId: 'vehicle-16', userId: 'user-1' });
        await repository.closeCase(confirmedCase.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Replaced radiator hose',
                partsReplaced: ['Radiator hose'],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        });
        await repository.closeCase(unconfirmedCase.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Tightened hose clamp',
                partsReplaced: [],
                codesCleared: false,
                symptomGone: false,
                retestPassed: false,
                confirmed: false,
            },
        });
        await repository.closeCase(otherVehicleCase.id, {
            type: 'outcome',
            actor,
            source: 'tech',
            occurredAt,
            payload: {
                repairPerformed: 'Replaced radiator hose',
                partsReplaced: [],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            },
        });
        const confirmed = await repository.findConfirmedOutcomes(vehicleId);
        expect(confirmed.length).toBe(1);
        expect(confirmed[0]?.caseId).toBe(confirmedCase.id);
        expect(confirmed[0]?.type).toBe('outcome');
    });
});
