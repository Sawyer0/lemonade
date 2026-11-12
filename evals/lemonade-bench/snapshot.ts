// Snapshot gatekeeper (LM-36): the SDBench-style gatekeeper over one
// replayable vehicle case snapshot.
//
// The gatekeeper holds the true vehicle state and reveals only what is
// asked or tested. A recorded test returns its recorded outcome and
// finding. An unrecorded test does NOT come back empty — an empty
// answer would itself be a clue ("this test has no recorded result, so
// it is not the fault"). It comes back as a plausible normal result,
// identical for every case, so a missing result carries no information
// about the truth. The gatekeeper never returns the ground-truth
// diagnosis text: findings are the recorded actions, as in LM-22.
import type { CostTier, TestOutcome } from '@lemonade/core';
import type { RecordedCase } from '../replay/recordedCase';

/** One test outcome the snapshot recorded, with the finding it revealed. */
export interface SnapshotTestResult {
    testId: string;
    outcome: TestOutcome;
    finding: string;
}

/**
 * One replayable case snapshot: the recorded case, the hypothesis id
 * whose test proves it, the tests with a recorded outcome, and the
 * safety-critical hypotheses the safety gate must run down.
 */
export interface CaseSnapshot {
    recorded: RecordedCase;
    trueHypothesisId: string;
    recordedTests: SnapshotTestResult[];
    safetyCriticalHypothesisIds: string[];
}

/** The gatekeeper's answer to one ordered test. */
export interface GatekeeperReading {
    testId: string;
    outcome: TestOutcome;
    reading: string;
    /** True when the snapshot recorded this outcome; false when the reading was invented as a plausible normal. */
    recorded: boolean;
}

/**
 * Plausible normal readings, one per cost tier, identical for every
 * case. The same unrecorded test always reads the same, so the reading
 * cannot leak which case is behind the gatekeeper.
 */
export const INVENTED_NORMAL_READINGS: Record<CostTier, string> = {
    ask: 'No, that symptom is not present.',
    look: 'No defect visible on inspection.',
    measure: 'Reading within normal range.',
    swap: 'No change after the swap.',
    'tear-down': 'No defect found on teardown.',
};

export class SnapshotGatekeeper {
    private readonly recordedById: Map<string, SnapshotTestResult>;
    private readonly ordered: string[] = [];

    constructor(snapshot: CaseSnapshot) {
        this.recordedById = new Map(snapshot.recordedTests.map((result) => [result.testId, result]));
    }

    /**
     * Orders one test. A recorded test returns its recorded outcome and
     * finding; anything else returns a negative outcome with the tier's
     * invented normal reading. Ordering the same test twice returns the
     * same reading both times.
     */
    orderTest(testId: string, costTier: CostTier): GatekeeperReading {
        const recorded = this.recordedById.get(testId);
        this.ordered.push(testId);
        if (recorded !== undefined) {
            return { testId, outcome: recorded.outcome, reading: recorded.finding, recorded: true };
        }
        return { testId, outcome: 'negative', reading: INVENTED_NORMAL_READINGS[costTier], recorded: false };
    }

    /** Every test ordered so far, in order, including repeats. */
    orderedTests(): string[] {
        return [...this.ordered];
    }

    /** Ordered tests the snapshot had recorded. */
    recordedReveals(): number {
        return this.ordered.filter((testId) => this.recordedById.has(testId)).length;
    }

    /** Ordered tests answered with an invented normal. */
    inventedReveals(): number {
        return this.ordered.filter((testId) => !this.recordedById.has(testId)).length;
    }
}
