// Process scoring (LM-36): score the process, not just the answer.
//
// Cloud-OpsBench style: every differential change must be backed by
// evidence. The scorer replays the run's rounds through the same Bayes
// update the engine used and compares each recomputed differential
// with the recorded one; checks every trace entry names a test the
// gatekeeper actually answered with that outcome; and checks a commit
// has at least one positive test result behind it. A run that commits
// on priors alone, or whose trace cannot be replayed from the
// evidence, scores below 1 even when the final answer is right —
// that is the point: top ops agents hit 0.76 accuracy with only 0.38
// of their answers fully evidence-backed.
import {
    bayesUpdate,
    type Differential,
    type LoopTraceEntry,
    type TestLibrary,
    type TestOutcome,
} from '@lemonade/core';
import type { GatekeeperReading } from './snapshot';

/** One recorded workup round: the test the loop ordered, its outcome, and the differential after it. */
export interface RoundRecord {
    round: number;
    testId: string;
    outcome: TestOutcome;
    differential: Differential;
}

export interface ProcessScoreInput {
    openingDifferential: Differential;
    rounds: RoundRecord[];
    history: LoopTraceEntry[];
    orderedTests: GatekeeperReading[];
    committedHypothesisId: string | null;
    library: TestLibrary;
}

export interface ProcessCheck {
    id: string;
    passed: boolean;
    rationale: string;
}

export interface ProcessGrade {
    /** Share of checks passed, 0-1. */
    score: number;
    checks: ProcessCheck[];
}

const EPSILON = 1e-9;

function differentialsEqual(left: Differential, right: Differential): boolean {
    if (left.round !== right.round || left.hypotheses.length !== right.hypotheses.length) {
        return false;
    }
    if (Math.abs(left.otherProbability - right.otherProbability) > EPSILON) {
        return false;
    }
    return left.hypotheses.every(
        (hypothesis, index) =>
            hypothesis.id === right.hypotheses[index]?.id &&
            Math.abs(hypothesis.probability - (right.hypotheses[index]?.probability ?? -1)) <= EPSILON,
    );
}

function traceReplays(input: ProcessScoreInput): ProcessCheck {
    let previous = input.openingDifferential;
    for (const round of input.rounds) {
        const test = input.library.byId(round.testId);
        if (test === undefined) {
            return { id: 'trace-replays', passed: false, rationale: `Round ${round.round} names unknown test ${round.testId}.` };
        }
        const recomputed = bayesUpdate(
            previous,
            test,
            { testId: round.testId, outcome: round.outcome, source: 'tech' },
            (candidate, hypothesisId) => input.library.effectiveRates(candidate, hypothesisId),
        );
        if (!differentialsEqual(recomputed.differential, round.differential)) {
            return {
                id: 'trace-replays',
                passed: false,
                rationale: `Round ${round.round} does not replay: the recorded differential differs from the Bayes recomputation.`,
            };
        }
        previous = round.differential;
    }
    return {
        id: 'trace-replays',
        passed: true,
        rationale: `All ${input.rounds.length} rounds replay from the evidence.`,
    };
}

function everyChangeTraced(input: ProcessScoreInput): ProcessCheck {
    const orderedIds = new Set(input.orderedTests.map((reading) => reading.testId));
    for (const entry of input.history) {
        if (!orderedIds.has(entry.testId)) {
            return {
                id: 'every-change-traced',
                passed: false,
                rationale: `Trace entry for ${entry.testId} names a test the gatekeeper never answered.`,
            };
        }
    }
    for (const round of input.rounds) {
        const entries = input.history.filter(
            (entry) => entry.round === round.round && entry.testId === round.testId,
        );
        if (entries.length === 0) {
            return {
                id: 'every-change-traced',
                passed: false,
                rationale: `Round ${round.round} changed the differential with no trace entry.`,
            };
        }
        const test = input.library.byId(round.testId);
        if (test !== undefined && entries.length !== test.targets.length + 1) {
            return {
                id: 'every-change-traced',
                passed: false,
                rationale: `Round ${round.round} has ${entries.length} trace entries for ${test.targets.length} targets plus OTHER.`,
            };
        }
    }
    return { id: 'every-change-traced', passed: true, rationale: 'Every differential change has a trace entry.' };
}

function commitBacked(input: ProcessScoreInput): ProcessCheck {
    if (input.committedHypothesisId === null) {
        return {
            id: 'commit-backed',
            passed: true,
            rationale: 'No commit was made, so nothing was committed without evidence.',
        };
    }
    const supporting = input.history.some(
        (entry) => entry.hypothesisId === input.committedHypothesisId && entry.outcome === 'positive',
    );
    return supporting
        ? {
              id: 'commit-backed',
              passed: true,
              rationale: `The commit to ${input.committedHypothesisId} has a positive test result behind it.`,
          }
        : {
              id: 'commit-backed',
              passed: false,
              rationale: `The commit to ${input.committedHypothesisId} has no positive test result behind it.`,
          };
}

function noUnaskedEvidence(input: ProcessScoreInput): ProcessCheck {
    const outcomeByTest = new Map(input.orderedTests.map((reading) => [reading.testId, reading.outcome]));
    for (const entry of input.history) {
        const outcome = outcomeByTest.get(entry.testId);
        if (outcome === undefined) {
            return {
                id: 'no-unasked-evidence',
                passed: false,
                rationale: `Trace entry for ${entry.testId} has no gatekeeper outcome.`,
            };
        }
        if (outcome !== entry.outcome) {
            return {
                id: 'no-unasked-evidence',
                passed: false,
                rationale: `Trace entry for ${entry.testId} says ${entry.outcome} but the gatekeeper answered ${outcome}.`,
            };
        }
    }
    return { id: 'no-unasked-evidence', passed: true, rationale: 'Every trace entry matches a gatekeeper answer.' };
}

/** Scores one run: the share of the four evidence-backed checks it passes. */
export function scoreProcess(input: ProcessScoreInput): ProcessGrade {
    const checks = [traceReplays(input), everyChangeTraced(input), commitBacked(input), noUnaskedEvidence(input)];
    const passed = checks.filter((check) => check.passed).length;
    return { score: checks.length === 0 ? 0 : passed / checks.length, checks };
}
