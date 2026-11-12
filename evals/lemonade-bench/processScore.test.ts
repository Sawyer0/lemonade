// Hand-graded process-score subset (LM-36): the scorer's verdicts on
// runs graded by hand, not by the scorer itself.
//
// The grades below are the hand grades: a perfect run scores 1.0, a
// commit with no positive test behind it loses the commit-backed check
// (0.75), a tampered trace loses the replay check (0.75), a trace
// entry for a test the gatekeeper never answered loses two checks
// (0.50), and an escalation with honest rounds still scores 1.0 —
// there is no commit to back, and every change is traced.
import { describe, expect, it } from 'vitest';
import {
    bayesUpdate,
    buildDifferential,
    type Differential,
    type LoopTraceEntry,
    type TestOutcome,
} from '@lemonade/core';
import type { FakeRule } from '../replay/fakeMechanic';
import { benchLibrary, benchRuleTable, type BenchRuleSpec } from './benchLibrary';
import { scoreProcess, type ProcessScoreInput, type RoundRecord } from './processScore';
import type { GatekeeperReading } from './snapshot';

const RULES: FakeRule[] = [
    {
        id: 'alpha',
        matchSets: [['alpha']],
        diagnosis: 'Alpha cause.',
        safetyStop: false,
        actions: ['Fix alpha'],
    },
    {
        id: 'beta',
        matchSets: [['beta']],
        diagnosis: 'Beta cause.',
        safetyStop: false,
        actions: ['Fix beta'],
    },
];

const SPECS: BenchRuleSpec[] = [
    {
        ruleId: 'alpha',
        question: 'whether alpha signs are present',
        checkTitle: 'Alpha check',
        checkLocation: 'alpha system',
        checkMinutes: 10,
        checkParts: [],
        repairUsd: 100,
        safetyCritical: false,
    },
    {
        ruleId: 'beta',
        question: 'whether beta signs are present',
        checkTitle: 'Beta check',
        checkLocation: 'beta system',
        checkMinutes: 10,
        checkParts: [],
        repairUsd: 100,
        safetyCritical: false,
    },
];

const TABLE = benchRuleTable(RULES, SPECS);
const LIBRARY = benchLibrary(TABLE);

function openingDifferential(): Differential {
    return buildDifferential({
        priorHypotheses: [
            { hypothesis: 'alpha', n: 1, pi: 0.6, sources: [{ source: 'lemonade-bench-proposer', observationCount: 1 }] },
            { hypothesis: 'beta', n: 1, pi: 0.4, sources: [{ source: 'lemonade-bench-proposer', observationCount: 1 }] },
        ],
        testDefinitions: LIBRARY.all(),
    });
}

function reading(testId: string, outcome: TestOutcome): GatekeeperReading {
    return { testId, outcome, reading: 'A reading.', recorded: true };
}

/** A genuine one-round run: a positive measure-alpha result, replayed through the real Bayes update. */
function genuineRun(): { opening: Differential; rounds: RoundRecord[]; history: LoopTraceEntry[] } {
    const opening = openingDifferential();
    const [test] = LIBRARY.all().filter((definition) => definition.id === 'measure-alpha');
    if (test === undefined) {
        throw new Error('expected the measure-alpha test');
    }
    const { differential, trace } = bayesUpdate(
        opening,
        test,
        { testId: 'measure-alpha', outcome: 'positive', source: 'tech' },
        (candidate, hypothesisId) => LIBRARY.effectiveRates(candidate, hypothesisId),
    );
    return {
        opening,
        rounds: [{ round: 1, testId: 'measure-alpha', outcome: 'positive', differential }],
        history: trace,
    };
}

function scoreFor(input: ProcessScoreInput): number {
    return scoreProcess(input).score;
}

describe('scoreProcess, hand-graded', () => {
    it('scores a perfect run 1.0: every change replays and the commit is backed', () => {
        const run = genuineRun();
        expect(
            scoreFor({
                openingDifferential: run.opening,
                rounds: run.rounds,
                history: run.history,
                orderedTests: [reading('measure-alpha', 'positive')],
                committedHypothesisId: 'alpha',
                library: LIBRARY,
            }),
        ).toBe(1);
    });

    it('scores a commit with no positive test behind it 0.75', () => {
        const run = genuineRun();
        const grade = scoreProcess({
            openingDifferential: run.opening,
            rounds: [],
            history: [],
            orderedTests: [],
            committedHypothesisId: 'alpha',
            library: LIBRARY,
        });
        expect(grade.score).toBe(0.75);
        expect(grade.checks.find((check) => check.id === 'commit-backed')?.passed).toBe(false);
        expect(grade.checks.filter((check) => check.passed)).toHaveLength(3);
    });

    it('scores a tampered trace 0.75: the round no longer replays', () => {
        const run = genuineRun();
        const [round] = run.rounds;
        if (round === undefined || round.differential.hypotheses[0] === undefined) {
            throw new Error('expected a round with a leading hypothesis');
        }
        const tampered: RoundRecord = {
            ...round,
            differential: {
                ...round.differential,
                hypotheses: [
                    { ...round.differential.hypotheses[0], probability: round.differential.hypotheses[0].probability + 0.01 },
                    ...round.differential.hypotheses.slice(1),
                ],
            },
        };
        const grade = scoreProcess({
            openingDifferential: run.opening,
            rounds: [tampered],
            history: run.history,
            orderedTests: [reading('measure-alpha', 'positive')],
            committedHypothesisId: 'alpha',
            library: LIBRARY,
        });
        expect(grade.score).toBe(0.75);
        expect(grade.checks.find((check) => check.id === 'trace-replays')?.passed).toBe(false);
    });

    it('scores a trace entry for a test never ordered 0.50', () => {
        const run = genuineRun();
        const phantom: LoopTraceEntry = {
            round: 1,
            testId: 'measure-beta',
            outcome: 'negative',
            hypothesisId: 'beta',
            priorProbability: 0.38,
            posteriorProbability: 0.1,
            hitRate: 0.9,
            falseAlarmRate: 0.1,
        };
        const grade = scoreProcess({
            openingDifferential: run.opening,
            rounds: run.rounds,
            history: [...run.history, phantom],
            orderedTests: [reading('measure-alpha', 'positive')],
            committedHypothesisId: 'alpha',
            library: LIBRARY,
        });
        expect(grade.score).toBe(0.5);
        expect(grade.checks.find((check) => check.id === 'every-change-traced')?.passed).toBe(false);
        expect(grade.checks.find((check) => check.id === 'no-unasked-evidence')?.passed).toBe(false);
    });

    it('scores an escalation with honest rounds 1.0: no commit to back', () => {
        const run = genuineRun();
        expect(
            scoreFor({
                openingDifferential: run.opening,
                rounds: run.rounds,
                history: run.history,
                orderedTests: [reading('measure-alpha', 'positive')],
                committedHypothesisId: null,
                library: LIBRARY,
            }),
        ).toBe(1);
    });
});
