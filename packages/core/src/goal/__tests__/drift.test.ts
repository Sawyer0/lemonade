import { describe, it, expect } from 'vitest';
import type { LedgerEntry } from '../../types/case';
import { HypothesisPayloadSchema } from '../../types/case';
import { amendGoal } from '../evaluateGoal';
import { CaseGoalSchema } from '../goalSchema';
import { blockerForRun, recordBlockedRun, runMadeProgress } from '../blocker';
import { detectDrift, type ReasonerRunOutcome } from '../drift';
import {
    buildDriftLedger,
    faultCodeDriftRun,
    hypothesisDriftRun,
    noProgressRun,
    onGoalRun,
    repairMismatchRun,
    replayRuns,
} from './fixtures/driftCases';
import { appendGoldenLedgerEntry, buildGoldenCase, buildGoldenGoal, GOLDEN_GOAL_ID } from './fixtures/goldenCase';

describe('detectDrift', () => {
    it('flags a leading hypothesis that explains none of the complaint symptoms', () => {
        const { goal, entries } = buildDriftLedger();
        const flags = detectDrift(goal, entries, hypothesisDriftRun(entries, 'run-1'));
        expect(flags.map((flag) => flag.kind)).toEqual(['hypothesis_explains_no_symptoms']);
        expect(flags[0]?.missingEvidence).toEqual(['misfire at idle', 'rough idle']);
        expect(flags[0]?.detail).toContain('Dead battery');
    });

    it('flags a proposed repair that does not match the committed cause', () => {
        const { goal, entries } = buildDriftLedger();
        const flags = detectDrift(goal, entries, repairMismatchRun(entries, 'run-1'));
        expect(flags.map((flag) => flag.kind)).toEqual(['repair_mismatches_committed_cause']);
        expect(flags[0]?.missingEvidence).toEqual(['ignition coil']);
        expect(flags[0]?.detail).toContain('Replace the fuel pump');
    });

    it('flags a fault code unrelated to the complaint', () => {
        const { goal, entries } = buildDriftLedger();
        const flags = detectDrift(goal, entries, faultCodeDriftRun(entries, 'run-1'));
        expect(flags.map((flag) => flag.kind)).toEqual(['fault_code_unrelated_to_complaint']);
        expect(flags[0]?.missingEvidence).toEqual(['P0300']);
        expect(flags[0]?.detail).toContain('P0420');
    });

    it('matches fault codes case-insensitively', () => {
        const { goal, entries } = buildDriftLedger();
        const run: ReasonerRunOutcome = { runId: 'run-1', targetedFaultCodes: ['p0300'], appendedEntries: [] };
        expect(detectDrift(goal, entries, run)).toEqual([]);
        const unrelated: ReasonerRunOutcome = { runId: 'run-2', targetedFaultCodes: ['p0420'], appendedEntries: [] };
        expect(detectDrift(goal, entries, unrelated).map((flag) => flag.kind)).toEqual([
            'fault_code_unrelated_to_complaint',
        ]);
    });

    it('raises no flag for an on-goal run', () => {
        const { goal, entries } = buildDriftLedger();
        expect(detectDrift(goal, entries, onGoalRun(entries, 'run-1'))).toEqual([]);
    });

    it('raises no flag when the hypothesis never declares its symptom coverage', () => {
        const { goal, entries } = buildDriftLedger();
        const run: ReasonerRunOutcome = {
            runId: 'run-1',
            leadingHypothesis: { text: 'Dead battery', confidence: 0.85 },
            appendedEntries: [],
        };
        expect(detectDrift(goal, entries, run)).toEqual([]);
    });

    it('raises no flag when cause and repair name no known repair term', () => {
        const { goal, entries } = buildDriftLedger();
        const run: ReasonerRunOutcome = {
            runId: 'run-1',
            committedCause: 'Worn flux capacitor',
            proposedRepair: 'Replace the flux capacitor housing',
            appendedEntries: [],
        };
        expect(detectDrift(goal, entries, run)).toEqual([]);
    });

    it('raises no flag for a targeted code when the complaint recorded no codes', () => {
        const goal = buildGoldenGoal();
        const entries: LedgerEntry[] = [];
        entries.push(appendGoldenLedgerEntry(entries, 'observation', { text: 'Misfire on cylinder 1 at idle' }));
        entries.push(appendGoldenLedgerEntry(entries, 'goal_set', { goalId: GOLDEN_GOAL_ID, goal }));
        const run: ReasonerRunOutcome = { runId: 'run-1', targetedFaultCodes: ['P0420'], appendedEntries: [] };
        expect(detectDrift(goal, entries, run)).toEqual([]);
    });

    it('reads the leading hypothesis from the ledger when the run declares none', () => {
        const { goal, entries } = buildDriftLedger();
        const drifted = appendGoldenLedgerEntry(
            entries,
            'hypothesis',
            { text: 'Dead battery', confidence: 0.9, explainsSymptoms: ['dim headlights'] },
            { source: 'model', actor: { kind: 'agent', id: 'mechanic-agent' } },
        );
        entries.push(drifted);
        const run: ReasonerRunOutcome = { runId: 'run-1', appendedEntries: [] };
        const flags = detectDrift(goal, entries, run);
        expect(flags.map((flag) => flag.kind)).toEqual(['hypothesis_explains_no_symptoms']);
    });
});

describe('runMadeProgress', () => {
    it('counts a run that only cites its own computation as no progress', () => {
        const { goal, entries } = buildDriftLedger();
        expect(runMadeProgress(goal, entries, noProgressRun(entries, 'run-1'))).toBe(false);
    });

    it('counts a sandbox re-test landed by the run as progress', () => {
        const { goal, entries } = buildDriftLedger();
        expect(runMadeProgress(goal, entries, onGoalRun(entries, 'run-1'))).toBe(true);
    });

    it('counts a tech observation appended by the run as progress', () => {
        const { goal, entries } = buildDriftLedger();
        const observation = appendGoldenLedgerEntry(entries, 'observation', {
            text: 'No misfire at idle after repair',
        });
        entries.push(observation);
        const run: ReasonerRunOutcome = { runId: 'run-1', appendedEntries: [observation] };
        expect(runMadeProgress(goal, entries, run)).toBe(true);
    });

    it('does not count an entry the same run corrected', () => {
        const { goal, entries } = buildDriftLedger();
        const retest = appendGoldenLedgerEntry(
            entries,
            'test_result',
            { testName: 'compression-cylinder-1', result: 'pass', measuredValue: 185, unit: 'psi' },
            { source: 'sandbox' },
        );
        entries.push(retest);
        const correction = appendGoldenLedgerEntry(
            entries,
            'correction',
            { text: 'Reading was from cylinder 2, not 1' },
            { correctsEntryId: retest.id },
        );
        entries.push(correction);
        const run: ReasonerRunOutcome = { runId: 'run-1', appendedEntries: [retest, correction] };
        expect(runMadeProgress(goal, entries, run)).toBe(false);
    });
});

describe('assessReasonerRun replay', () => {
    it('three identical blocked runs produce one needs_tech handoff naming the missing evidence', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [hypothesisDriftRun, hypothesisDriftRun, hypothesisDriftRun]);
        expect(assessments[0]?.handoff).toBeUndefined();
        expect(assessments[1]?.handoff).toBeUndefined();
        const handoff = assessments[2]?.handoff;
        expect(handoff).toBeDefined();
        expect(handoff?.repeats).toBe(3);
        expect(handoff?.missingEvidence).toContain('rough idle');
        expect(handoff?.missingEvidence).toContain('misfire at idle');
        expect(handoff?.statusChange.to).toBe('needs_tech');
        expect(handoff?.statusChange.authority).toBe('code');
        expect(handoff?.statusChange.reason).toContain('Same blocker 3 times');
        expect(assessments[2]?.goal.status).toBe('needs_tech');
        expect(assessments[2]?.goal.sameBlockerCount).toBe(3);
    });

    it('a fourth identical blocked run produces no second handoff', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [
            hypothesisDriftRun,
            hypothesisDriftRun,
            hypothesisDriftRun,
            hypothesisDriftRun,
        ]);
        expect(assessments[2]?.handoff).toBeDefined();
        expect(assessments[3]?.handoff).toBeUndefined();
        expect(assessments[3]?.goal.status).toBe('needs_tech');
    });

    it('a different blocker restarts the streak', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [hypothesisDriftRun, faultCodeDriftRun]);
        expect(assessments[0]?.goal.sameBlockerCount).toBe(1);
        expect(assessments[1]?.goal.sameBlockerCount).toBe(1);
        expect(assessments[1]?.handoff).toBeUndefined();
    });

    it('a run that makes progress resets the streak', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [hypothesisDriftRun, onGoalRun]);
        expect(assessments[0]?.goal.sameBlockerCount).toBe(1);
        expect(assessments[1]?.goal.sameBlockerCount).toBe(0);
        expect(assessments[1]?.goal.lastBlocker).toBeUndefined();
        expect(assessments[1]?.blocked).toBe(false);
    });

    it('a no-progress run blocks and names the goal’s unmet blocking criteria', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const assessments = replayRuns(goal, entries, [noProgressRun]);
        expect(assessments[0]?.flags).toEqual([]);
        expect(assessments[0]?.madeProgress).toBe(false);
        expect(assessments[0]?.blocked).toBe(true);
        expect(assessments[0]?.blocker?.key).toBe('no_progress');
        expect(assessments[0]?.blocker?.missingEvidence).toContain(
            'Pre-registered compression re-test passes after the repair',
        );
    });

    it('a stalled run on a satisfied goal names any admissible entry as the missing evidence', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [noProgressRun]);
        expect(assessments[0]?.blocker?.missingEvidence).toEqual(['an admissible ledger entry toward the goal']);
    });

    it('an amendment restarts the blocker streak', () => {
        const { goal, entries } = buildDriftLedger();
        const [first] = replayRuns(goal, entries, [hypothesisDriftRun]);
        expect(first?.goal.sameBlockerCount).toBe(1);
        const amended = amendGoal(
            first?.goal ?? goal,
            { outcome: 'Root cause confirmed, gasket replaced' },
            { confirmedByTech: true, techId: 'tech-123' },
        );
        expect(amended.version).toBe(2);
        expect(amended.sameBlockerCount).toBe(0);
        expect(amended.lastBlocker).toBeUndefined();
    });
});

describe('recordBlockedRun', () => {
    it('never hands off a goal that is already needs_tech', () => {
        const { goal, entries } = buildDriftLedger();
        const assessments = replayRuns(goal, entries, [hypothesisDriftRun, hypothesisDriftRun, hypothesisDriftRun]);
        const handedOff = assessments[2]?.goal;
        expect(handedOff?.status).toBe('needs_tech');
        const again = recordBlockedRun(
            handedOff ?? goal,
            blockerForRun(goal, entries, assessments[2]?.flags ?? [], false),
        );
        expect(again.handoff).toBeUndefined();
        expect(again.goal.status).toBe('needs_tech');
    });
});

describe('LM-28 schema', () => {
    it('parses a hypothesis payload with explainsSymptoms, and without it', () => {
        expect(
            HypothesisPayloadSchema.parse({
                text: 'Dead battery',
                confidence: 0.85,
                explainsSymptoms: ['dim headlights'],
            }),
        ).toEqual({ text: 'Dead battery', confidence: 0.85, explainsSymptoms: ['dim headlights'] });
        expect(HypothesisPayloadSchema.parse({ text: 'Dead battery', confidence: 0.85 })).toEqual({
            text: 'Dead battery',
            confidence: 0.85,
        });
    });

    it('parses a goal without lastBlocker, and a fresh goal starts with no streak', () => {
        const parsed = CaseGoalSchema.parse(buildGoldenGoal());
        expect(parsed.lastBlocker).toBeUndefined();
        expect(parsed.sameBlockerCount).toBe(0);
    });
});
