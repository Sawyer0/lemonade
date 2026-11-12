import { describe, it, expect } from 'vitest';
import { TestLibrary } from '../../tests/testLibrary';
import { buildDifferential } from '../hypotheses';
import { planNextTest, testCostUsd, findChallenger, discriminationProbability } from '../planner';
import { libraryRates } from '../loop';
import { validTestDefinition } from '../../tests/__tests__/testDefinitionFactory';
import { misfireDefinitions, misfirePriors } from './fixtures';

function plannerState() {
    return {
        disassemblyState: 'component-exposed' as const,
        satisfiedPreconditionIds: new Set(['engine-off', 'engine-cool', 'engine-off-cranks-only']),
        completedTestIds: new Set<string>(),
    };
}

describe('testCostUsd', () => {
    it('prices labor, parts, downtime, and risk from the config rates', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const swap = library.byId('swap-coil-cylinder') as NonNullable<ReturnType<TestLibrary['byId']>>;
        const cost = testCostUsd(swap, library);
        expect(cost).toEqual({
            laborUsd: 20 * 2,
            partsUsd: 0,
            downtimeUsd: 20 * 1,
            riskUsd: 25,
            totalUsd: 85,
        });
    });
});

describe('planNextTest', () => {
    it('picks the lowest expected cost to resolve, cheapest tier first', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const plan = planNextTest(differential, library, plannerState(), libraryRates(library));
        // Ask costs $15 and discriminates 0.23 of the mass: $65 to
        // resolve. Measure-spark costs $70 for 0.55: $127. Ask wins.
        expect(plan.nextTest?.testId).toBe('ask-misfire-conditions');
        expect(plan.nextTest?.cost.totalUsd).toBe(15);
        expect(plan.nextTest?.discriminationProbability).toBeCloseTo(0.2319, 3);
        // The next step carries location, connection, conditions,
        // expected value, and yes/no outcomes for the live agent.
        expect(plan.nextTest?.steps[0]?.location).toContain('driver seat');
        expect(plan.nextTest?.spoken.join(' ')).toContain('If yes');
        expect(plan.nextTest?.spoken.join(' ')).toContain('If no');
    });

    it('is optimal in a single-fault case: probability over cost beats cheap-but-useless', () => {
        const cheapWeak = validTestDefinition({
            id: 'cheap-weak-test',
            title: 'Cheap weak test',
            costTier: 'ask',
            safetyClass: 'routine',
            hazards: [],
            disassemblyState: 'none',
            targets: [{ hypothesisId: 'the-fault', hitRate: 0.6, falseAlarmRate: 0.4 }],
            cost: { laborMinutes: 10, tools: [], parts: [] },
            preconditions: [],
            verification: {
                status: 'verified',
                source: 'expert',
                reviewedBy: 'master-tech-1',
                reviewedAt: '2026-11-11',
            },
        });
        const priceyStrong = validTestDefinition({
            id: 'pricey-strong-test',
            title: 'Pricey strong test',
            costTier: 'measure',
            safetyClass: 'routine',
            hazards: [],
            disassemblyState: 'none',
            targets: [{ hypothesisId: 'the-fault', hitRate: 0.95, falseAlarmRate: 0.05 }],
            cost: { laborMinutes: 30, tools: [], parts: [] },
            preconditions: [],
            verification: {
                status: 'verified',
                source: 'expert',
                reviewedBy: 'master-tech-1',
                reviewedAt: '2026-11-11',
            },
        });
        const library = TestLibrary.fromDefinitions([cheapWeak, priceyStrong]);
        const differential = buildDifferential({
            priorHypotheses: [{ hypothesis: 'the-fault', n: 9, q: 0.9, pi: 0.9, sources: [] }],
            testDefinitions: [],
        });
        const plan = planNextTest(
            differential,
            library,
            { disassemblyState: 'none', satisfiedPreconditionIds: new Set(), completedTestIds: new Set() },
            libraryRates(library),
        );
        // Cheap: $30 / (0.95 * 0.2) = $158 to resolve. Pricey: $90 /
        // (0.95 * 0.9) = $105. The expensive test resolves cheaper.
        expect(discriminationProbability(differential, cheapWeak, libraryRates(library))).toBeCloseTo(0.19, 3);
        expect(plan.nextTest?.testId).toBe('pricey-strong-test');
    });

    it('never plans a test whose safety precondition is unsatisfied', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const unready = planNextTest(
            differential,
            library,
            { disassemblyState: 'component-exposed', satisfiedPreconditionIds: new Set(), completedTestIds: new Set() },
            libraryRates(library),
        );
        // Only the ask test has no preconditions; everything else is gated.
        expect(unready.nextTest?.testId).toBe('ask-misfire-conditions');
    });

    it('never plans a test that is already completed', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const plan = planNextTest(
            differential,
            library,
            { ...plannerState(), completedTestIds: new Set(['ask-misfire-conditions']) },
            libraryRates(library),
        );
        expect(plan.nextTest?.testId).toBe('measure-spark-strength');
    });

    it('falls back to information gain per dollar when no test discriminates', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        // Degenerate rates: every test is uninformative, so every
        // discrimination is zero and the gain fallback must still pick
        // one — cheapest tier first — instead of giving up.
        const plan = planNextTest(differential, library, plannerState(), () => ({
            hitRate: 0.5,
            falseAlarmRate: 0.5,
        }));
        expect(plan.nextTest?.testId).toBe('ask-misfire-conditions');
    });

    it('returns no next test when the library is empty', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const plan = planNextTest(differential, TestLibrary.fromDefinitions([]), plannerState(), libraryRates(library));
        expect(plan.nextTest).toBeNull();
        expect(plan.challenger).toBeNull();
    });
});

describe('findChallenger', () => {
    it('offers the cheapest test that could disprove the leader, distinct from the plan', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const plan = planNextTest(differential, library, plannerState(), libraryRates(library));
        // Leader is the coil. Swap ($85, hit 0.9) and measure-spark
        // ($70, hit 0.85) can both disprove it; the cheaper one wins.
        expect(plan.challenger?.testId).toBe('measure-spark-strength');
        expect(plan.challenger?.testId).not.toBe(plan.nextTest?.testId);
    });

    it('returns null when no test can disprove the leader', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const differential = buildDifferential({
            priorHypotheses: [{ hypothesis: 'misfire-cylinder-3', n: 9, q: 1, pi: 1, sources: [] }],
            testDefinitions: [],
        });
        // The only test targeting cylinder-3 is the ask test, hit 0.75:
        // below the challenger bar, so it cannot disprove the leader.
        const challenger = findChallenger(differential, library, plannerState(), undefined, libraryRates(library));
        expect(challenger).toBeNull();
    });
});
