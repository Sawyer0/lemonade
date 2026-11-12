import { createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import {
    LEDGER_GENESIS_HASH,
    LedgerEntrySchema,
    computeLedgerEntryHash,
    type Case,
    type LedgerEntry,
    type LedgerHasher,
    type LedgerSource,
} from '../../../types/case';
import { buildGoal } from '../../evaluateGoal';
import type { CaseGoal } from '../../goalSchema';

// Golden-case replay fixture (LM-25): one tech, one vehicle, one misfire.
// The goal's criteria come from the workflow template for a misfire
// complaint: a sharp posterior, a pre-registered compression re-test, and a
// tech observation that the symptom is gone. The ledger below satisfies all
// three, so evaluateGoal returns all-met — and only after the re-test entry
// recorded after goal_set exists. Variants flip one fact at a time so the
// evaluator tests can prove each done-when clause separately.

export const GOLDEN_CASE_ID = '11111111-1111-4111-8111-111111111111';
export const GOLDEN_GOAL_ID = '22222222-2222-4222-8222-222222222222';

const nodeHasher: LedgerHasher = {
    digestHex: (content: string) => createHash('sha256').update(content, 'utf8').digest('hex'),
};

const OCCURRED_AT = new Date('2026-11-11T10:00:00.000Z');

/** The workflow template's criteria for a misfire complaint. */
export function buildGoldenGoal(): CaseGoal {
    return buildGoal({
        goalId: GOLDEN_GOAL_ID,
        caseId: GOLDEN_CASE_ID,
        complaint: {
            text: 'Misfire on cylinder 1 at idle',
            symptoms: ['misfire at idle', 'rough idle'],
            confirmedByTech: true,
        },
        outcome: 'Root cause of misfire on cylinder 1 confirmed and repair verified',
        constraints: ['no spoken diagnosis without ledger citations', 'no physical step without LM-20 confirm'],
        criteria: [
            {
                id: 'differentiate.top_hypothesis',
                phase: 'differentiate',
                description: 'One root-cause hypothesis leads the posterior by a clear margin',
                check: { kind: 'posterior', minTop: 0.7, minMargin: 0.2 },
            },
            {
                id: 'verify.retest',
                phase: 'verify',
                description: 'Pre-registered compression re-test passes after the repair',
                check: {
                    kind: 'pre_registered_test_passed',
                    testName: 'compression-cylinder-1',
                    admissible: ['tech', 'sandbox'],
                },
            },
            {
                id: 'verify.symptom_absent',
                phase: 'verify',
                description: 'No misfire at idle after the repair',
                check: {
                    kind: 'ledger_has',
                    entryKind: 'observation',
                    where: { text: 'No misfire at idle after repair' },
                    admissible: ['tech'],
                },
            },
        ],
        budget: { maxTokens: 200000, maxWallMinutes: 60, maxTestCostMinutes: 30 },
    });
}

/** Appends one entry to a chain, computing its hash like the repository does. */
export function appendGoldenLedgerEntry(
    previous: LedgerEntry[],
    type: LedgerEntry['type'],
    payload: LedgerEntry['payload'],
    overrides: Partial<Pick<LedgerEntry, 'source' | 'actor' | 'correctsEntryId'>> = {},
): LedgerEntry {
    const caseId = GOLDEN_CASE_ID;
    const sequence = previous.length + 1;
    const previousHash = previous.length === 0 ? LEDGER_GENESIS_HASH : previous[previous.length - 1].entryHash;
    const actor = overrides.actor ?? { kind: 'user', id: 'tech-123' };
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
        ...(overrides.correctsEntryId ? { correctsEntryId: overrides.correctsEntryId } : {}),
    });
}

function appendToChain(
    previous: LedgerEntry[],
    type: LedgerEntry['type'],
    payload: LedgerEntry['payload'],
    overrides: Partial<Pick<LedgerEntry, 'source' | 'actor' | 'correctsEntryId'>> = {},
): LedgerEntry {
    return appendGoldenLedgerEntry(previous, type, payload, overrides);
}

export interface GoldenCaseOptions {
    /** Result of the compression re-test, or 'absent' for no re-test entry. */
    retestResult?: 'pass' | 'fail' | 'inconclusive' | 'absent';
    /** Source of the re-test entry. A 'model' re-test never proves anything. */
    retestSource?: LedgerSource;
    /** Put the passing re-test before goal_set: it is not the pre-registered re-test. */
    retestBeforeGoal?: boolean;
    /** Append a correction retracting the re-test entry. */
    correctRetest?: boolean;
    /** Confidences for [head-gasket first, ignition coil, head-gasket again]. */
    hypothesisConfidences?: [number, number, number];
    /** Include the tech observation that the symptom is gone. */
    symptomAbsent?: boolean;
    /**
     * The outcome entry closing the case. 'head-gasket' is the honest
     * repair; 'cleared-codes' is the LM-30 shortcut — codes cleared,
     * symptom claimed gone, no repair; 'absent' records no outcome.
     */
    outcome?: 'head-gasket' | 'cleared-codes' | 'absent';
}

export function buildGoldenCase(options: GoldenCaseOptions = {}): {
    caseRecord: Case;
    goal: CaseGoal;
    entries: LedgerEntry[];
} {
    const {
        retestResult = 'pass',
        retestSource = 'sandbox',
        retestBeforeGoal = false,
        correctRetest = false,
        hypothesisConfidences = [0.55, 0.3, 0.8],
        symptomAbsent = true,
        outcome = 'head-gasket',
    } = options;
    const goal = buildGoldenGoal();
    const caseRecord: Case = {
        id: GOLDEN_CASE_ID,
        vehicleId: 'vehicle-1',
        userId: 'user-1',
        status: 'open',
        version: 1,
        createdAt: OCCURRED_AT,
        updatedAt: OCCURRED_AT,
    };

    const entries: LedgerEntry[] = [];
    const appendRetest = (): LedgerEntry | undefined => {
        if (retestResult === 'absent') {
            return undefined;
        }
        return appendToChain(
            entries,
            'test_result',
            {
                testName: 'compression-cylinder-1',
                result: retestResult,
                measuredValue: 185,
                unit: 'psi',
            },
            { source: retestSource },
        );
    };

    entries.push(
        appendToChain(entries, 'vin_decoded', { vin: '1HGCM82633A004352', year: 2003, make: 'Honda', model: 'Accord' }),
    );
    entries.push(appendToChain(entries, 'dtc_read', { codes: ['P0300'] }, { source: 'OBD' }));
    entries.push(appendToChain(entries, 'observation', { text: 'Misfire on cylinder 1 at idle' }));
    entries.push(
        appendToChain(
            entries,
            'hypothesis',
            { text: 'Head gasket leak', confidence: hypothesisConfidences[0] },
            { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
        ),
    );
    entries.push(
        appendToChain(
            entries,
            'hypothesis',
            { text: 'Ignition coil failure', confidence: hypothesisConfidences[1] },
            { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
        ),
    );
    entries.push(
        appendToChain(
            entries,
            'hypothesis',
            { text: 'Head gasket leak', confidence: hypothesisConfidences[2] },
            { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
        ),
    );
    let retestEntry: LedgerEntry | undefined;
    if (retestBeforeGoal) {
        retestEntry = appendRetest();
        if (retestEntry !== undefined) {
            entries.push(retestEntry);
        }
    }
    entries.push(appendToChain(entries, 'goal_set', { goalId: GOLDEN_GOAL_ID, goal }));
    if (!retestBeforeGoal) {
        retestEntry = appendRetest();
        if (retestEntry !== undefined) {
            entries.push(retestEntry);
        }
    }
    if (correctRetest && retestEntry !== undefined) {
        entries.push(
            appendToChain(
                entries,
                'correction',
                { text: 'Compression reading was from cylinder 2, not 1' },
                {
                    correctsEntryId: retestEntry.id,
                },
            ),
        );
    }
    if (symptomAbsent) {
        entries.push(appendToChain(entries, 'observation', { text: 'No misfire at idle after repair' }));
    }
    if (outcome === 'head-gasket') {
        entries.push(
            appendToChain(entries, 'outcome', {
                repairPerformed: 'Replaced head gasket',
                partsReplaced: ['Head gasket'],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            }),
        );
    }
    if (outcome === 'cleared-codes') {
        entries.push(
            appendToChain(entries, 'outcome', {
                repairPerformed: 'Cleared fault codes',
                partsReplaced: [],
                codesCleared: true,
                symptomGone: true,
                retestPassed: true,
                confirmed: true,
            }),
        );
    }
    return { caseRecord, goal, entries };
}
