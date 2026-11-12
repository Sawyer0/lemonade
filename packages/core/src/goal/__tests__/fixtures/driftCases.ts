import { assessReasonerRun, type RunAssessment } from '../../blocker';
import type { ReasonerRunOutcome } from '../../drift';
import type { CaseGoal } from '../goalSchema';
import type { LedgerEntry } from '../../../types/case';
import { appendGoldenLedgerEntry, buildGoldenCase } from './goldenCase';

// Drift replay fixtures (LM-28): a scripted reasoner runs against the
// golden misfire case (symptoms 'misfire at idle' and 'rough idle', fault
// code P0300). Each factory appends the run's ledger entries to the shared
// chain, then returns the run outcome the detector reads, so a test replays
// runs in order through assessReasonerRun exactly as the harness would.
//
// The drifting runs mirror what the real runner cites: a model-sourced
// `test_result` for the sandbox computation. That citation is not admissible
// evidence (LM-25: model output never proves anything), so a drifting run
// is blocked twice over — drift flag plus no progress — and its blocker key
// is identical on every replay, which is what the three-repeat handoff
// needs.

export function buildDriftLedger(): { goal: CaseGoal; entries: LedgerEntry[] } {
    const { goal, entries } = buildGoldenCase();
    return { goal, entries };
}

/** Appends one entry to the shared chain and returns it. */
function appendRunEntry(
    entries: LedgerEntry[],
    type: LedgerEntry['type'],
    payload: LedgerEntry['payload'],
    overrides: Partial<Pick<LedgerEntry, 'source' | 'actor'>> = {},
): LedgerEntry {
    const entry = appendGoldenLedgerEntry(entries, type, payload, overrides);
    entries.push(entry);
    return entry;
}

/** The runner's citation: a model-sourced test_result. Not admissible progress. */
function modelCitation(entries: LedgerEntry[]): LedgerEntry {
    return appendRunEntry(
        entries,
        'test_result',
        {
            testName: 'reasoner_sandbox_computation',
            result: 'pass',
            notes: 'Computed fuel trims from the PID log.',
        },
        { source: 'model', actor: { kind: 'agent', id: 'reasoner' } },
    );
}

/** The leading hypothesis explains symptoms the complaint never had. */
export function hypothesisDriftRun(entries: LedgerEntry[], runId: string): ReasonerRunOutcome {
    return {
        runId,
        leadingHypothesis: {
            text: 'Dead battery',
            confidence: 0.85,
            explainsSymptoms: ['dim headlights', 'slow cranking'],
        },
        appendedEntries: [modelCitation(entries)],
    };
}

/** The committed cause is the ignition coil; the proposed repair is the fuel pump. */
export function repairMismatchRun(entries: LedgerEntry[], runId: string): ReasonerRunOutcome {
    return {
        runId,
        leadingHypothesis: {
            text: 'Ignition coil failure',
            confidence: 0.8,
            explainsSymptoms: ['rough idle'],
        },
        committedCause: 'Ignition coil failure on cylinder 1',
        proposedRepair: 'Replace the fuel pump',
        appendedEntries: [modelCitation(entries)],
    };
}

/** The complaint's code is P0300; the reasoner chases P0420 instead. */
export function faultCodeDriftRun(entries: LedgerEntry[], runId: string): ReasonerRunOutcome {
    return {
        runId,
        leadingHypothesis: {
            text: 'Ignition coil failure',
            confidence: 0.8,
            explainsSymptoms: ['misfire at idle'],
        },
        targetedFaultCodes: ['P0420'],
        appendedEntries: [modelCitation(entries)],
    };
}

/** No claim, no evidence: only the model citation, which is not progress. */
export function noProgressRun(entries: LedgerEntry[], runId: string): ReasonerRunOutcome {
    return {
        runId,
        appendedEntries: [modelCitation(entries)],
    };
}

/** On goal: the hypothesis explains the complaint, the repair matches the cause, the code matches, and a sandbox re-test lands. */
export function onGoalRun(entries: LedgerEntry[], runId: string): ReasonerRunOutcome {
    const retest = appendRunEntry(
        entries,
        'test_result',
        {
            testName: 'compression-cylinder-1',
            result: 'pass',
            measuredValue: 185,
            unit: 'psi',
        },
        { source: 'sandbox', actor: { kind: 'agent', id: 'reasoner' } },
    );
    return {
        runId,
        leadingHypothesis: {
            text: 'Ignition coil failure',
            confidence: 0.85,
            explainsSymptoms: ['misfire at idle', 'rough idle'],
        },
        committedCause: 'Ignition coil failure on cylinder 1',
        proposedRepair: 'Replace the ignition coil',
        targetedFaultCodes: ['P0300'],
        appendedEntries: [retest],
    };
}

export type DriftRunFactory = (entries: LedgerEntry[], runId: string) => ReasonerRunOutcome;

/**
 * Replays scripted runs against the goal in order, threading the updated
 * goal through each assessment. Each factory appends its run's entries to
 * the shared ledger before the assessment reads it, as the harness does.
 */
export function replayRuns(
    goal: CaseGoal,
    entries: LedgerEntry[],
    factories: ReadonlyArray<DriftRunFactory>,
): RunAssessment[] {
    let current = goal;
    return factories.map((factory, index) => {
        const run = factory(entries, `run-${index + 1}`);
        const assessment = assessReasonerRun(current, entries, run);
        current = assessment.goal;
        return assessment;
    });
}
