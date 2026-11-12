// Finish gate (LM-19): the challenger + checklist + independent gate that
// runs before the talker may state a diagnosis.
//
// This module is pure and model-free: it holds the claim types, the
// deterministic checklist (every cited code, spec value and test name
// validated against the DTC table and the test library), the claim builder
// that turns a run's structured evidence into claims, and the abstain
// handoff an abstention speaks instead of a diagnosis. The two model calls
// (challenger, independent judge) live in infrastructure's FinishGate; the
// state machine loop lives in mechanic.machine.
import { z } from 'zod';
import { GENERIC_DTC_DESCRIPTIONS, parseDtc } from '../dtc';
import { retractedEntryIds, type LedgerEntry } from '../types/case';
import type { FinalDiagnosis, VerificationData } from '../types/neurosymbolic';
import type { AIAnalysis, SafetyRecall } from '../types/models';
import type { LocalTriageResult } from '../types/localPerception';
import type { ParsedDtc } from '../dtc/types';
import type { DiagnosticLoopState, LoopDecision } from './loop/types';
import type { TestDefinition } from './tests/testSchema';
import type { TestLibrary } from './tests/testLibrary';
import { isFactEligibleEvent } from '../memory/ledgerReference';

// --- Claims ---
// One verifiable statement the candidate diagnosis rests on, plus the
// ledger entry ids that prove it. The talker never speaks a diagnosis
// whose claims lack citations: the checklist below rejects any claim
// that cites nothing, or cites an entry that does not exist, was
// retracted, or is not admissible as proof.

export const DiagnosisClaimSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('hypothesis'),
            id: z.string().min(1),
            text: z.string().min(1),
            citations: z.array(z.string().min(1)),
        })
        .strict(),
    z
        .object({
            kind: z.literal('dtc'),
            id: z.string().min(1),
            text: z.string().min(1),
            code: z.string().min(1),
            citations: z.array(z.string().min(1)),
        })
        .strict(),
    z
        .object({
            kind: z.literal('test'),
            id: z.string().min(1),
            text: z.string().min(1),
            testId: z.string().min(1),
            citations: z.array(z.string().min(1)),
        })
        .strict(),
    z
        .object({
            kind: z.literal('spec'),
            id: z.string().min(1),
            text: z.string().min(1),
            testId: z.string().min(1),
            value: z.number(),
            unit: z.string().min(1),
            citations: z.array(z.string().min(1)),
        })
        .strict(),
]);
export type DiagnosisClaim = z.infer<typeof DiagnosisClaimSchema>;

// --- Challenger objections ---
// An argument against the leading hypothesis, grounded in ledger entries.
// `decisive` means a cited entry directly contradicts the hypothesis: a
// decisive objection blocks the diagnosis on its own.

export const ChallengerObjectionSchema = z
    .object({
        text: z.string().min(1),
        ledgerEntryIds: z.array(z.string().min(1)),
        decisive: z.boolean(),
    })
    .strict();
export type ChallengerObjection = z.infer<typeof ChallengerObjectionSchema>;

// --- Abstain handoff ---
// What an abstention speaks instead of a diagnosis: why the run stopped,
// what the ledger confirmed, what it ruled out, the next test to run, and
// when a human must take over. This is the one handoff shape the machine
// uses: the goal terminal resolver reads `reason`, the service speaks the
// rest. The `reason` is the attempt's own failure reasons; `escalateWhen`
// folds the same reasons into the human handover rule.

export const AbstainHandoffSchema = z
    .object({
        reason: z.string().min(1),
        confirmed: z.array(z.string().min(1)),
        ruledOut: z.array(z.string().min(1)),
        nextTest: z.string().min(1).nullable(),
        escalateWhen: z.string().min(1),
    })
    .strict();
export type AbstainHandoff = z.infer<typeof AbstainHandoffSchema>;

// --- Checklist ---

export const ChecklistFailureCodeSchema = z.enum([
    'missing-citation',
    'unknown-citation',
    'retracted-citation',
    'inadmissible-citation',
    'unknown-dtc',
    'dtc-not-in-ledger',
    'unknown-test',
    'spec-out-of-range',
    'spec-no-expectation',
    'test-library-unavailable',
]);
export type ChecklistFailureCode = z.infer<typeof ChecklistFailureCodeSchema>;

export const ChecklistFailureSchema = z
    .object({
        claimId: z.string().min(1),
        code: ChecklistFailureCodeSchema,
        reason: z.string().min(1),
    })
    .strict();
export type ChecklistFailure = z.infer<typeof ChecklistFailureSchema>;

export interface ChecklistVerdict {
    passed: boolean;
    failures: ChecklistFailure[];
}

// --- Gate verdict ---
// One attempt's outcome. `pass` speaks the candidate; `retry` sends the
// objections back as evidence for another attempt; `abstain` speaks the
// handoff instead. `skipped` means no gate was bound, or the ledger was
// genuinely empty so there was nothing to argue from: the diagnosis runs
// as it did before the gate existed. A ledger read that failed is not a
// skip — the case exists but its entries could not be read, so the
// gating actor abstains instead (fail closed).

export const FinishGateOutcomeSchema = z.enum(['pass', 'retry', 'abstain', 'skipped']);
export type FinishGateOutcome = z.infer<typeof FinishGateOutcomeSchema>;

export const FinishGateVerdictSchema = z
    .object({
        passed: z.boolean(),
        outcome: FinishGateOutcomeSchema,
        objections: z.array(ChallengerObjectionSchema),
        checklistFailures: z.array(ChecklistFailureSchema),
        reasons: z.array(z.string().min(1)),
        handoff: AbstainHandoffSchema.optional(),
    })
    .strict();
export type FinishGateVerdict = z.infer<typeof FinishGateVerdictSchema>;

// --- Run input / result ---
// Everything the gate needs for one attempt: the synthesis inputs the
// candidate is built from, the case ledger, the workup's stop decision,
// and the attempt number (1-based). The machine's gating actor builds
// this from context; the service never hands the gate a bare string.

export interface FinishGateRunInput {
    visual: AIAnalysis;
    recalls: SafetyRecall[];
    similar: unknown[];
    verification: VerificationData;
    localTriage?: LocalTriageResult;
    dtcCodes: ParsedDtc[];
    ledger: LedgerEntry[];
    loopState?: DiagnosticLoopState | null;
    loopDecision?: LoopDecision | null;
    testDefinitions?: TestDefinition[];
    attempt: number;
    /** Passed through to the challenger and judge logs; the session id when run from the machine. */
    traceId?: string;
}

export interface FinishGateRunResult extends FinishGateVerdict {
    candidate?: FinalDiagnosis;
}

/** The port the machine's gating actor calls. The live FinishGate implements it; tests bind fakes. */
export interface FinishGateRunner {
    evaluateRun(input: FinishGateRunInput): Promise<FinishGateRunResult>;
}

/** A ledger entry may be cited as proof only when it is fact-eligible and not model-sourced. */
export function isCitableLedgerEntry(entry: LedgerEntry): boolean {
    return isFactEligibleEvent({
        eventId: entry.id,
        caseId: entry.caseId,
        type: entry.type,
        source: entry.source,
        createdAt: entry.createdAt.toISOString(),
    });
}

/** Codes a `dtc_read` entry recorded. */
function dtcReadCodes(entry: LedgerEntry): string[] {
    return entry.type === 'dtc_read' ? entry.payload.codes : [];
}

/** Codes an `obd_scan` entry recorded, across stored, pending and permanent. */
function obdScanCodes(entry: LedgerEntry): string[] {
    if (entry.type !== 'obd_scan') return [];
    return [...entry.payload.storedCodes, ...entry.payload.pendingCodes, ...entry.payload.permanentCodes];
}

/** Whether any of the cited entries records this DTC code. */
function citedEntryRecordsCode(code: string, cited: LedgerEntry[]): boolean {
    const wanted = code.toUpperCase();
    return cited.some((entry) => {
        const codes = [...dtcReadCodes(entry), ...obdScanCodes(entry)];
        return codes.some((recorded) => recorded.toUpperCase() === wanted);
    });
}

/** A test definition by its id slug, or by the title the ledger recorded under `testName`. */
function findTestDefinition(testId: string, library: TestLibrary): TestDefinition | undefined {
    return library.byId(testId) ?? library.all().find((definition) => definition.title === testId);
}

/** Checks one claim's citations exist, are citable, and are not retracted. */
function checkCitations(
    claim: DiagnosisClaim,
    entriesById: ReadonlyMap<string, LedgerEntry>,
    retracted: ReadonlySet<string>,
    failures: ChecklistFailure[],
): LedgerEntry[] {
    const cited: LedgerEntry[] = [];
    if (claim.citations.length === 0) {
        failures.push({
            claimId: claim.id,
            code: 'missing-citation',
            reason: `Claim "${claim.text}" cites no ledger entry`,
        });
        return cited;
    }
    for (const entryId of claim.citations) {
        const entry = entriesById.get(entryId);
        if (!entry) {
            failures.push({
                claimId: claim.id,
                code: 'unknown-citation',
                reason: `Cited ledger entry ${entryId} does not exist`,
            });
            continue;
        }
        if (retracted.has(entryId)) {
            failures.push({
                claimId: claim.id,
                code: 'retracted-citation',
                reason: `Cited ledger entry ${entryId} was retracted by a later correction`,
            });
            continue;
        }
        if (!isCitableLedgerEntry(entry)) {
            failures.push({
                claimId: claim.id,
                code: 'inadmissible-citation',
                reason: `Cited ledger entry ${entryId} (${entry.type} from ${entry.source}) is not admissible as proof`,
            });
            continue;
        }
        cited.push(entry);
    }
    return cited;
}

/** Checks one DTC claim against the parser and the SAE table, then against the cited entries. */
function checkDtcClaim(
    claim: Extract<DiagnosisClaim, { kind: 'dtc' }>,
    cited: LedgerEntry[],
    failures: ChecklistFailure[],
): void {
    const parsed = parseDtc(claim.code);
    if (!parsed.ok) {
        failures.push({
            claimId: claim.id,
            code: 'unknown-dtc',
            reason: `Cited code ${claim.code} is not a valid DTC: ${parsed.failure.reason}`,
        });
        return;
    }
    // Generic codes must have a table entry: the table is the meaning, and
    // a generic code with no entry is unknown, not merely undescribed.
    // Manufacturer-specific codes have no table meaning by design — their
    // meaning belongs to the manufacturer — so parsing is the whole check.
    if (parsed.parsed.generic && GENERIC_DTC_DESCRIPTIONS[claim.code.toUpperCase()] === undefined) {
        failures.push({
            claimId: claim.id,
            code: 'unknown-dtc',
            reason: `Cited code ${claim.code} has no entry in the DTC table`,
        });
        return;
    }
    if (!citedEntryRecordsCode(claim.code, cited)) {
        failures.push({
            claimId: claim.id,
            code: 'dtc-not-in-ledger',
            reason: `Cited code ${claim.code} was not recorded by any cited ledger entry`,
        });
    }
}

/** Checks one spec claim's value against the cited test's expected values. */
function checkSpecClaim(
    claim: Extract<DiagnosisClaim, { kind: 'spec' }>,
    library: TestLibrary | undefined,
    failures: ChecklistFailure[],
): void {
    if (!library) {
        failures.push({
            claimId: claim.id,
            code: 'test-library-unavailable',
            reason: `Cannot validate spec value for test "${claim.testId}": no test library is loaded`,
        });
        return;
    }
    const definition = findTestDefinition(claim.testId, library);
    if (!definition) {
        failures.push({
            claimId: claim.id,
            code: 'unknown-test',
            reason: `Cited test "${claim.testId}" is not in the test library`,
        });
        return;
    }
    const step = definition.steps.find(
        (candidate) => candidate.expected.kind !== 'text' && candidate.expected.unit === claim.unit,
    );
    if (!step) {
        failures.push({
            claimId: claim.id,
            code: 'spec-no-expectation',
            reason: `Test "${claim.testId}" has no expected value in ${claim.unit}`,
        });
        return;
    }
    const expected = step.expected;
    // Narrowing guard: the find above already excluded text expectations,
    // but the type cannot know that.
    if (expected.kind === 'text') {
        failures.push({
            claimId: claim.id,
            code: 'spec-no-expectation',
            reason: `Test "${claim.testId}" has no numeric expected value in ${claim.unit}`,
        });
        return;
    }
    const within =
        expected.kind === 'value'
            ? claim.value === expected.value
            : claim.value >= expected.min && claim.value <= expected.max;
    if (!within) {
        const expectedText =
            expected.kind === 'value'
                ? `${expected.value} ${expected.unit}`
                : `${expected.min}-${expected.max} ${expected.unit}`;
        failures.push({
            claimId: claim.id,
            code: 'spec-out-of-range',
            reason: `Measured ${claim.value} ${claim.unit} for test "${claim.testId}" is outside the expected ${expectedText}`,
        });
    }
}

/**
 * The deterministic checklist (LM-19 task 2): every claim must cite a real,
 * citable, non-retracted ledger entry; every cited DTC must parse, have a
 * table entry when generic, and be recorded by a cited entry; every cited
 * test must exist in the library; every cited spec value must fall inside
 * the cited test's expected value. No model is consulted.
 */
export function checkDiagnosisClaims(
    claims: ReadonlyArray<DiagnosisClaim>,
    ledger: ReadonlyArray<LedgerEntry>,
    testLibrary?: TestLibrary,
): ChecklistVerdict {
    const failures: ChecklistFailure[] = [];
    const entriesById = new Map(ledger.map((entry) => [entry.id, entry]));
    const retracted = retractedEntryIds(ledger);
    for (const claim of claims) {
        const cited = checkCitations(claim, entriesById, retracted, failures);
        if (claim.kind === 'dtc') {
            checkDtcClaim(claim, cited, failures);
        }
        if (claim.kind === 'test') {
            if (!testLibrary) {
                failures.push({
                    claimId: claim.id,
                    code: 'test-library-unavailable',
                    reason: `Cannot validate test "${claim.testId}": no test library is loaded`,
                });
            } else if (!findTestDefinition(claim.testId, testLibrary)) {
                failures.push({
                    claimId: claim.id,
                    code: 'unknown-test',
                    reason: `Cited test "${claim.testId}" is not in the test library`,
                });
            }
        }
        if (claim.kind === 'spec') {
            checkSpecClaim(claim, testLibrary, failures);
        }
    }
    return { passed: failures.length === 0, failures };
}

// --- Claim builder ---
// Builds the claims a candidate rests on from the run's structured
// evidence, never from free text: the hypothesis claim cites the whole
// citable evidence set (the independent judge checks the mapping, the
// checklist checks the citations are real); DTC and test claims cite the
// entries that recorded exactly that code or test; spec claims cite the
// test_result entries that measured a value with a unit.

export interface ClaimsForRunInput {
    diagnosis: string;
    dtcCodes: ParsedDtc[];
    loopState?: DiagnosticLoopState | null;
    testDefinitions?: TestDefinition[];
    ledger: LedgerEntry[];
}

export function claimsForRun(input: ClaimsForRunInput): DiagnosisClaim[] {
    const citable = input.ledger.filter(isCitableLedgerEntry);
    const claims: DiagnosisClaim[] = [
        {
            kind: 'hypothesis',
            id: 'hypothesis',
            text: input.diagnosis,
            citations: citable.map((entry) => entry.id),
        },
    ];
    for (const dtc of input.dtcCodes) {
        const recordedBy = input.ledger.filter(
            (entry) =>
                isCitableLedgerEntry(entry) &&
                [...dtcReadCodes(entry), ...obdScanCodes(entry)].some(
                    (recorded) => recorded.toUpperCase() === dtc.code.toUpperCase(),
                ),
        );
        claims.push({
            kind: 'dtc',
            id: `dtc-${dtc.code.toLowerCase()}`,
            text: `DTC ${dtc.code} was read from the vehicle`,
            code: dtc.code,
            citations: recordedBy.map((entry) => entry.id),
        });
    }
    const completedTestIds = input.loopState?.completedTestIds ?? [];
    for (const testId of completedTestIds) {
        const title = input.testDefinitions?.find((definition) => definition.id === testId)?.title;
        // A `test_result` names its test in `testName` (id slug or title).
        // A `guided_test` carries no test-library id, so it never cites a
        // specific test claim.
        const recordedBy = input.ledger.filter(
            (entry) =>
                isCitableLedgerEntry(entry) &&
                entry.type === 'test_result' &&
                (entry.payload.testName === testId || (title !== undefined && entry.payload.testName === title)),
        );
        claims.push({
            kind: 'test',
            id: `test-${testId}`,
            text: `Test ${title ?? testId} was run`,
            testId,
            citations: recordedBy.map((entry) => entry.id),
        });
    }
    for (const entry of input.ledger) {
        if (entry.type !== 'test_result' || !isCitableLedgerEntry(entry)) continue;
        const { measuredValue, unit, testName } = entry.payload;
        if (measuredValue === undefined || unit === undefined) continue;
        claims.push({
            kind: 'spec',
            id: `spec-${entry.id}`,
            text: `Test "${testName}" measured ${measuredValue} ${unit}`,
            testId: testName,
            value: measuredValue,
            unit,
            citations: [entry.id],
        });
    }
    return claims;
}

// --- Ledger prompt rendering ---
// One line per entry for the challenger and judge prompts: fact-eligible,
// non-retracted entries only, so the models argue from evidence, never
// from the reasoner's own claims or from advisory lookups.

function payloadSummary(entry: LedgerEntry): string {
    switch (entry.type) {
        case 'dtc_read':
            return `codes: ${entry.payload.codes.join(', ')}`;
        case 'test_result':
            return `${entry.payload.testName}: ${entry.payload.result}${entry.payload.measuredValue !== undefined ? ` (${entry.payload.measuredValue} ${entry.payload.unit ?? ''})` : ''}`;
        case 'observation':
            return entry.payload.text;
        case 'obd_scan':
            return `stored: ${entry.payload.storedCodes.join(', ') || 'none'}; pending: ${entry.payload.pendingCodes.join(', ') || 'none'}`;
        case 'guided_test':
            return JSON.stringify(entry.payload);
        case 'outcome':
            return `${entry.payload.repairPerformed}, confirmed: ${entry.payload.confirmed}`;
        case 'vin_decoded':
            return `VIN ${entry.payload.vin}${entry.payload.make ? `, ${entry.payload.year ?? ''} ${entry.payload.make} ${entry.payload.model ?? ''}` : ''}`;
        case 'verify_fix':
            return JSON.stringify(entry.payload);
        default:
            return entry.type;
    }
}

export function summarizeLedgerEntry(entry: LedgerEntry): string {
    return `[${entry.id}] ${entry.type} (${entry.source}): ${payloadSummary(entry)}`;
}

/** The ledger lines the challenger and the judge may argue from. */
export function citableLedgerSummaries(ledger: ReadonlyArray<LedgerEntry>): string[] {
    const retracted = retractedEntryIds(ledger);
    return ledger.filter((entry) => isCitableLedgerEntry(entry) && !retracted.has(entry.id)).map(summarizeLedgerEntry);
}

// --- Handoff ---

export interface HandoffInput {
    reason: string;
    confirmed: string[];
    ruledOut: string[];
    nextTest: string | null;
    blockedReasons: string[];
}

/**
 * Builds the abstain handoff from what the gate established. When to
 * escalate is fixed — a human takes over when the next test still does
 * not confirm a cause, or when any safety-critical symptom appears —
 * plus the concrete reasons this attempt was blocked.
 */
export function buildAbstainHandoff(input: HandoffInput): AbstainHandoff {
    return {
        reason: input.reason,
        confirmed: input.confirmed,
        ruledOut: input.ruledOut,
        nextTest: input.nextTest,
        escalateWhen: `Escalate to a human mechanic if the next test does not confirm a cause, or if any safety-critical symptom appears. Blocked because: ${input.blockedReasons.join('; ')}`,
    };
}

/** The final diagnosis an abstention speaks: the handoff, never a guess. */
export function buildAbstainFinalDiagnosis(handoff: AbstainHandoff, reasons: string[]): FinalDiagnosis {
    const confirmed = handoff.confirmed.length > 0 ? handoff.confirmed.join('; ') : 'Nothing is confirmed yet.';
    const ruledOut = handoff.ruledOut.length > 0 ? handoff.ruledOut.join('; ') : 'Nothing has been ruled out yet.';
    const nextTest =
        handoff.nextTest !== null
            ? `Next test: ${handoff.nextTest}.`
            : 'No further test is planned — a human mechanic should take it from here.';
    return {
        decision: 'REFER_TO_HUMAN',
        reasoningTrace: `FINISH_GATE: diagnosis withheld after the challenger, checklist and independent gate could not pass it. ${reasons.join(' ')}`,
        userOutput: [
            "I can't confirm a diagnosis from the evidence so far, so I'm holding off rather than guessing.",
            `Confirmed: ${confirmed}`,
            `Ruled out: ${ruledOut}`,
            nextTest,
            `When to escalate: ${handoff.escalateWhen}`,
        ].join('\n'),
        requiredActions:
            handoff.nextTest !== null
                ? ['Consult Human Mechanic', `Run the next test: ${handoff.nextTest}`]
                : ['Consult Human Mechanic'],
        metaConfidence: 0,
    };
}
