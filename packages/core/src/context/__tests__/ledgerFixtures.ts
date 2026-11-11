import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import {
    LEDGER_GENESIS_HASH,
    LedgerEntrySchema,
    computeLedgerEntryHash,
    type Case,
    type LedgerEntry,
    type LedgerHasher,
} from '../../types/case';
import type { ContextTurn } from '../types';

// Tests run under Node, so the test-local hasher can use node:crypto. The
// production hasher lives in infrastructure; core itself stays free of
// Node-only imports so the mobile app can import it.
export const nodeHasher: LedgerHasher = {
    digestHex: (content: string) => createHash('sha256').update(content, 'utf8').digest('hex'),
};

const OCCURRED_AT = new Date('2026-11-11T10:00:00.000Z');

export function buildCase(overrides: Partial<Case> = {}): Case {
    return {
        id: uuidv4(),
        vehicleId: 'vehicle-1',
        userId: 'user-1',
        status: 'open',
        createdAt: OCCURRED_AT,
        updatedAt: OCCURRED_AT,
        ...overrides,
    };
}

function sha256Hex(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Appends one entry to a chain, computing its hash like the repository does. */
export function appendToChain(
    previous: LedgerEntry[],
    type: LedgerEntry['type'],
    payload: LedgerEntry['payload'],
    overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
    const caseId = previous.length === 0 ? uuidv4() : previous[0].caseId;
    const sequence = previous.length + 1;
    const previousHash = previous.length === 0 ? LEDGER_GENESIS_HASH : previous[previous.length - 1].entryHash;
    // An override that changes a hashed field (source, actor) must change
    // the hash too, or the entry fails chain verification.
    const actor = overrides.actor ?? ({ kind: 'user', id: 'tech-123' } as const);
    const source = overrides.source ?? 'tech';
    const entryHash = computeLedgerEntryHash(nodeHasher, {
        caseId,
        sequence,
        type,
        actor,
        source,
        occurredAt: OCCURRED_AT,
        payload,
        previousHash,
        ...(overrides.correctsEntryId ? { correctsEntryId: overrides.correctsEntryId } : {}),
    });
    return LedgerEntrySchema.parse({
        id: uuidv4(),
        caseId,
        sequence,
        type,
        actor,
        source,
        occurredAt: OCCURRED_AT,
        payload,
        previousHash,
        entryHash,
        createdAt: OCCURRED_AT,
        ...overrides,
    });
}

const LEDGER_TYPE_CYCLE: ReadonlyArray<LedgerEntry['type']> = [
    'vin_decoded',
    'dtc_read',
    'observation',
    'frame_captured',
    'test_result',
    'hypothesis',
    'safety_stop',
    'outcome',
    'correction',
];

const TEST_NAME_CYCLE = ['fuel-pressure-test', 'parasitic-draw-test', 'compression-test'] as const;
const TEST_RESULT_CYCLE = ['pass', 'fail', 'inconclusive'] as const;

function payloadFor(type: LedgerEntry['type'], index: number): LedgerEntry['payload'] {
    switch (type) {
        case 'vin_decoded':
            return {
                vin: `1HGCM82633A${String(index).padStart(6, '0')}`,
                year: 2019,
                make: 'Honda',
                model: 'Accord',
            };
        case 'dtc_read':
            return { codes: [`P${String(index).padStart(4, '0')}`] };
        case 'observation':
            return { text: `observation-fact-${index}` };
        case 'frame_captured':
            return {
                media: { storageUri: `gs://bucket/frame-${index}.jpg`, sha256: sha256Hex(`frame-${index}`) },
                resolution: 'high',
            };
        case 'test_result':
            return {
                testName: TEST_NAME_CYCLE[index % TEST_NAME_CYCLE.length],
                result: TEST_RESULT_CYCLE[index % TEST_RESULT_CYCLE.length],
                measuredValue: index,
                unit: 'psi',
                notes: `test-note-${index}`,
            };
        case 'hypothesis':
            return { text: `hypothesis-fact-${index}`, confidence: 0.5 };
        case 'safety_stop':
            return { reason: `safety-fact-${index}`, hazard: `hazard-${index}` };
        case 'outcome': {
            // LM-05 outcome shape: repair performed, parts replaced, and the
            // confirmed-fixed flags. `confirmed` tracks the three flags so
            // the payload always satisfies the confirmed-outcome rule.
            const fixed = index % 2 === 0;
            return {
                repairPerformed: `outcome-fact-${index}`,
                partsReplaced: [`part-${index}`],
                codesCleared: fixed,
                symptomGone: fixed,
                retestPassed: fixed,
                confirmed: fixed,
                notes: `outcome-note-${index}`,
            };
        }
        case 'correction':
            return { text: `correction-fact-${index}` };
    }
}

/**
 * Builds a deterministic ledger of `count` entries cycling through every
 * event type, each carrying a unique `fact-<index>` marker. A correction
 * always corrects the entry before it. Returns the entries and the case
 * they belong to.
 */
export function buildLedger(count: number): { caseRecord: Case; entries: LedgerEntry[] } {
    const entries: LedgerEntry[] = [];
    const caseRecord = buildCase();
    for (let index = 0; index < count; index++) {
        const type = LEDGER_TYPE_CYCLE[index % LEDGER_TYPE_CYCLE.length];
        const overrides: Partial<LedgerEntry> =
            type === 'correction' && entries.length > 0 ? { correctsEntryId: entries[entries.length - 1].id } : {};
        const entry = appendToChain(entries, type, payloadFor(type, index), overrides);
        entries.push(entry);
    }
    // All entries must share one case id; appendToChain derives it from the
    // first entry, but the case record was built separately, so align it.
    const alignedCase = { ...caseRecord, id: entries[0].caseId };
    return { caseRecord: alignedCase, entries };
}

/** Builds `count` alternating user/assistant turns with unique markers. */
export function buildTurns(count: number): ContextTurn[] {
    const turns: ContextTurn[] = [];
    for (let index = 0; index < count; index++) {
        turns.push({
            role: index % 2 === 0 ? 'user' : 'assistant',
            kind: 'conversation',
            content: `turn-${index} ${index % 2 === 0 ? 'user message' : 'assistant reply'}`,
        });
    }
    return turns;
}
