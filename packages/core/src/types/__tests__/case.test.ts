import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import {
    AppendLedgerEntryInputSchema,
    CaseSchema,
    LedgerEntrySchema,
    OutcomePayloadSchema,
    canonicalJson,
    computeLedgerEntryHash,
    verifyLedgerChain,
    LEDGER_GENESIS_HASH,
    type LedgerEntry,
    type LedgerHasher,
} from '../case';
import { buildGoldenGoal } from '../../goal/__tests__/fixtures/goldenCase';

// Tests run under Node, so the test-local hasher can use node:crypto. The
// production hasher lives in infrastructure; core itself stays free of
// Node-only imports so the mobile app can import it.
const nodeHasher: LedgerHasher = {
    digestHex: (content: string) => createHash('sha256').update(content, 'utf8').digest('hex'),
};

const caseId = uuidv4();
const actor = { kind: 'user', id: 'tech-123' } as const;
const occurredAt = new Date('2026-11-11T10:00:00.000Z');

/** Appends one entry to a chain, computing its hash like the repository does. */
function appendToChain(
    previous: LedgerEntry[],
    type: LedgerEntry['type'],
    payload: LedgerEntry['payload'],
    overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
    const sequence = previous.length + 1;
    const previousHash = previous.length === 0 ? LEDGER_GENESIS_HASH : previous[previous.length - 1].entryHash;
    const entryHash = computeLedgerEntryHash(nodeHasher, {
        caseId,
        sequence,
        type,
        actor: { kind: 'user', id: 'tech-123' },
        source: 'tech',
        occurredAt,
        payload,
        previousHash,
        ...(overrides.correctsEntryId ? { correctsEntryId: overrides.correctsEntryId } : {}),
    });
    return LedgerEntrySchema.parse({
        id: uuidv4(),
        caseId,
        sequence,
        type,
        actor: { kind: 'user', id: 'tech-123' },
        source: 'tech',
        occurredAt,
        payload,
        previousHash,
        entryHash,
        createdAt: new Date('2026-11-11T10:00:00.000Z'),
        ...overrides,
    });
}

describe('CaseSchema', () => {
    it('parses a valid case', () => {
        const result = CaseSchema.safeParse({
            id: uuidv4(),
            vehicleId: 'vehicle-1',
            userId: 'user-1',
            status: 'open',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        expect(result.success).toBe(true);
    });

    it('rejects a case without a version or with a version below 1', () => {
        const base = {
            id: uuidv4(),
            vehicleId: 'vehicle-1',
            userId: 'user-1',
            status: 'open',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        expect(CaseSchema.safeParse(base).success).toBe(false);
        expect(CaseSchema.safeParse({ ...base, version: 0 }).success).toBe(false);
        expect(CaseSchema.safeParse({ ...base, version: 2 }).success).toBe(true);
    });

    it('rejects an unknown status', () => {
        const result = CaseSchema.safeParse({
            id: uuidv4(),
            vehicleId: 'vehicle-1',
            userId: 'user-1',
            status: 'archived',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        expect(result.success).toBe(false);
    });
});

describe('OutcomePayloadSchema', () => {
    const confirmedOutcome = {
        repairPerformed: 'Replaced radiator hose',
        partsReplaced: ['Radiator hose'],
        codesCleared: true,
        symptomGone: true,
        retestPassed: true,
        confirmed: true,
    };

    it('accepts a confirmed outcome with all three checks passed', () => {
        expect(OutcomePayloadSchema.safeParse(confirmedOutcome).success).toBe(true);
    });

    it('accepts an unconfirmed outcome with checks unmet', () => {
        const result = OutcomePayloadSchema.safeParse({
            ...confirmedOutcome,
            codesCleared: false,
            symptomGone: false,
            retestPassed: false,
            confirmed: false,
            notes: 'Coolant still weeping at the clamp; needs a second look',
        });
        expect(result.success).toBe(true);
    });

    it('rejects a confirmed outcome when any check failed', () => {
        for (const failedCheck of ['codesCleared', 'symptomGone', 'retestPassed'] as const) {
            const result = OutcomePayloadSchema.safeParse({ ...confirmedOutcome, [failedCheck]: false });
            expect(result.success).toBe(false);
        }
    });

    it('defaults partsReplaced to an empty list', () => {
        const { repairPerformed, codesCleared, symptomGone, retestPassed, confirmed } = confirmedOutcome;
        const result = OutcomePayloadSchema.safeParse({
            repairPerformed,
            codesCleared,
            symptomGone,
            retestPassed,
            confirmed,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.partsReplaced).toEqual([]);
        }
    });

    it('rejects an outcome without the repair performed', () => {
        const result = OutcomePayloadSchema.safeParse({
            partsReplaced: ['Radiator hose'],
            codesCleared: true,
            symptomGone: true,
            retestPassed: true,
            confirmed: true,
        });
        expect(result.success).toBe(false);
    });
});

describe('LedgerEntrySchema', () => {
    it('parses each event type with its own payload', () => {
        const goal = buildGoldenGoal();
        const payloads: Array<{ type: LedgerEntry['type']; payload: LedgerEntry['payload'] }> = [
            { type: 'vin_decoded', payload: { vin: '1HGCM82633A004352', year: 2003, make: 'Honda', model: 'Accord' } },
            { type: 'dtc_read', payload: { codes: ['P0300', 'P0171'] } },
            { type: 'observation', payload: { text: 'Coolant pooling under the radiator' } },
            {
                type: 'frame_captured',
                payload: { media: { storageUri: 'gs://bucket/frame.jpg', sha256: 'a'.repeat(64) } },
            },
            {
                type: 'test_result',
                payload: { testName: 'Compression cylinder 1', result: 'pass', measuredValue: 185, unit: 'psi' },
            },
            { type: 'hypothesis', payload: { text: 'Head gasket leak', confidence: 0.7 } },
            { type: 'safety_stop', payload: { reason: 'Fuel leak near a hot exhaust' } },
            {
                type: 'outcome',
                payload: {
                    repairPerformed: 'Replaced radiator hose',
                    partsReplaced: ['Radiator hose'],
                    codesCleared: true,
                    symptomGone: true,
                    retestPassed: true,
                    confirmed: true,
                },
            },
            { type: 'correction', payload: { text: 'Cylinder was 3, not 1' } },
            { type: 'goal_set', payload: { goalId: goal.goalId, goal } },
            {
                type: 'goal_amended',
                payload: {
                    goalId: goal.goalId,
                    previousVersion: 1,
                    version: 2,
                    amendedByTechId: 'tech-123',
                    note: 'Symptom list corrected',
                },
            },
            {
                type: 'criterion_met',
                payload: { goalId: goal.goalId, criterionId: 'verify.retest', entryId: uuidv4(), entrySequence: 8 },
            },
            {
                type: 'goal_status_changed',
                payload: { goalId: goal.goalId, from: 'active', to: 'verified_fix', authority: 'code' },
            },
        ];
        for (const { type, payload } of payloads) {
            const entry = appendToChain([], type, payload, type === 'correction' ? { correctsEntryId: uuidv4() } : {});
            expect(entry.type).toBe(type);
        }
    });

    it('rejects a payload that belongs to another type', () => {
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'hypothesis',
            actor,
            source: 'tech',
            occurredAt,
            payload: { codes: ['P0300'] },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });

    it('rejects correctsEntryId on a non-correction entry', () => {
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Coolant pooling under the radiator' },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            correctsEntryId: uuidv4(),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });

    it('rejects a hypothesis confidence outside 0-1', () => {
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'hypothesis',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Head gasket leak', confidence: 1.4 },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });

    it('rejects a VIN that is not 17 characters', () => {
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'vin_decoded',
            actor,
            source: 'tech',
            occurredAt,
            payload: { vin: 'SHORT' },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });

    it('rejects a goal_set entry whose goalId disagrees with the embedded goal', () => {
        const goal = buildGoldenGoal();
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'goal_set',
            actor,
            source: 'tech',
            occurredAt,
            payload: { goalId: uuidv4(), goal },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });

    it('rejects a media reference with a malformed sha256', () => {
        const result = LedgerEntrySchema.safeParse({
            id: uuidv4(),
            caseId,
            sequence: 1,
            type: 'frame_captured',
            actor,
            source: 'glasses',
            occurredAt,
            payload: { media: { storageUri: 'gs://bucket/frame.jpg', sha256: 'not-a-hash' } },
            previousHash: LEDGER_GENESIS_HASH,
            entryHash: 'b'.repeat(64),
            createdAt: new Date(),
        });
        expect(result.success).toBe(false);
    });
});

describe('AppendLedgerEntryInputSchema', () => {
    it('requires correctsEntryId on a correction', () => {
        const result = AppendLedgerEntryInputSchema.safeParse({
            type: 'correction',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Cylinder was 3, not 1' },
        });
        expect(result.success).toBe(false);
    });

    it('rejects correctsEntryId on a non-correction entry', () => {
        const result = AppendLedgerEntryInputSchema.safeParse({
            type: 'observation',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Coolant pooling under the radiator' },
            correctsEntryId: uuidv4(),
        });
        expect(result.success).toBe(false);
    });

    it('accepts a correction that references the original entry', () => {
        const result = AppendLedgerEntryInputSchema.safeParse({
            type: 'correction',
            actor,
            source: 'tech',
            occurredAt,
            payload: { text: 'Cylinder was 3, not 1' },
            correctsEntryId: uuidv4(),
        });
        expect(result.success).toBe(true);
    });

    it('accepts the goal ledger kinds', () => {
        const goal = buildGoldenGoal();
        const inputs = [
            { type: 'goal_set', payload: { goalId: goal.goalId, goal } },
            {
                type: 'goal_amended',
                payload: {
                    goalId: goal.goalId,
                    previousVersion: 1,
                    version: 2,
                    amendedByTechId: 'tech-123',
                    note: 'Symptom list corrected',
                },
            },
            {
                type: 'criterion_met',
                payload: { goalId: goal.goalId, criterionId: 'verify.retest', entryId: uuidv4(), entrySequence: 8 },
            },
            {
                type: 'goal_status_changed',
                payload: { goalId: goal.goalId, from: 'active', to: 'verified_fix', authority: 'code' },
            },
        ];
        for (const input of inputs) {
            const result = AppendLedgerEntryInputSchema.safeParse({ ...input, actor, source: 'tech', occurredAt });
            expect(result.success).toBe(true);
        }
    });

    it('accepts a sandboxed test run as an evidence source', () => {
        const result = AppendLedgerEntryInputSchema.safeParse({
            type: 'test_result',
            actor,
            source: 'sandbox',
            occurredAt,
            payload: { testName: 'compression-cylinder-1', result: 'pass' },
        });
        expect(result.success).toBe(true);
    });
});

describe('canonicalJson', () => {
    it('sorts keys so key order does not change the hash input', () => {
        expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
    });

    it('serializes dates as ISO strings', () => {
        expect(canonicalJson({ at: new Date('2026-11-11T10:00:00.000Z') })).toBe('{"at":"2026-11-11T10:00:00.000Z"}');
    });
});

describe('computeLedgerEntryHash', () => {
    it('is deterministic for the same input', () => {
        const input = {
            caseId,
            sequence: 1,
            type: 'observation' as const,
            actor: { kind: 'user' as const, id: 'tech-123' },
            source: 'tech' as const,
            occurredAt,
            payload: { text: 'Coolant pooling under the radiator' },
            previousHash: LEDGER_GENESIS_HASH,
        };
        expect(computeLedgerEntryHash(nodeHasher, input)).toBe(computeLedgerEntryHash(nodeHasher, input));
    });

    it('changes when the previous hash changes', () => {
        const base = {
            caseId,
            sequence: 2,
            type: 'observation' as const,
            actor: { kind: 'user' as const, id: 'tech-123' },
            source: 'tech' as const,
            occurredAt,
            payload: { text: 'Coolant pooling under the radiator' },
        };
        const first = computeLedgerEntryHash(nodeHasher, { ...base, previousHash: 'a'.repeat(64) });
        const second = computeLedgerEntryHash(nodeHasher, { ...base, previousHash: 'b'.repeat(64) });
        expect(first).not.toBe(second);
    });

    it('hashes a payload with an explicit undefined exactly like the key absent', () => {
        // JSONB drops explicitly-undefined keys on storage, so the hash must
        // not depend on them — otherwise append-time and verify-time hashes
        // of the same entry would disagree.
        const base = {
            caseId,
            sequence: 1,
            type: 'test_result' as const,
            actor: { kind: 'user' as const, id: 'tech-123' },
            source: 'tech' as const,
            occurredAt,
            previousHash: LEDGER_GENESIS_HASH,
        };
        const withUndefined = computeLedgerEntryHash(nodeHasher, {
            ...base,
            payload: { testName: 'Compression', result: 'pass' as const, measuredValue: undefined },
        });
        const withoutKey = computeLedgerEntryHash(nodeHasher, {
            ...base,
            payload: { testName: 'Compression', result: 'pass' as const },
        });
        expect(withUndefined).toBe(withoutKey);
    });
});

describe('verifyLedgerChain', () => {
    function buildChain(): LedgerEntry[] {
        const entries: LedgerEntry[] = [];
        entries.push(appendToChain(entries, 'vin_decoded', { vin: '1HGCM82633A004352' }));
        entries.push(appendToChain(entries, 'dtc_read', { codes: ['P0300'] }));
        entries.push(appendToChain(entries, 'observation', { text: 'Misfire on cylinder 1' }));
        return entries;
    }

    it('accepts a well-formed chain', () => {
        expect(verifyLedgerChain(nodeHasher, buildChain())).toBe(true);
    });

    it('accepts an empty chain', () => {
        expect(verifyLedgerChain(nodeHasher, [])).toBe(true);
    });

    it('accepts entries given out of order', () => {
        const chain = buildChain();
        expect(verifyLedgerChain(nodeHasher, [chain[2], chain[0], chain[1]])).toBe(true);
    });

    it('rejects a tampered payload', () => {
        const chain = buildChain();
        const tampered = { ...chain[1], payload: { codes: ['P0000'] } };
        expect(verifyLedgerChain(nodeHasher, [chain[0], tampered, chain[2]])).toBe(false);
    });

    it('rejects a tampered previous hash', () => {
        const chain = buildChain();
        const tampered = { ...chain[1], previousHash: 'c'.repeat(64) };
        expect(verifyLedgerChain(nodeHasher, [chain[0], tampered, chain[2]])).toBe(false);
    });

    it('rejects a gap in the sequence', () => {
        const chain = buildChain();
        const gapped = { ...chain[2], sequence: 4 };
        expect(verifyLedgerChain(nodeHasher, [chain[0], chain[1], gapped])).toBe(false);
    });

    it('rejects a chain whose second entry still points at genesis', () => {
        const chain = buildChain();
        const relinked = { ...chain[1], previousHash: LEDGER_GENESIS_HASH };
        expect(verifyLedgerChain(nodeHasher, [chain[0], relinked, chain[2]])).toBe(false);
    });
});
