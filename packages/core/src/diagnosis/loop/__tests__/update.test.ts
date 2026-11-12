import { describe, it, expect } from 'vitest';
import { TestLibrary } from '../../tests/testLibrary';
import { buildDifferential } from '../hypotheses';
import { bayesUpdate } from '../update';
import { misfireDefinitions, misfirePriors } from './fixtures';

function rankedDifferential() {
    return buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
}

describe('bayesUpdate', () => {
    it('raises a targeted hypothesis on a positive result and lowers it on a negative one', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const test = library.byId('swap-coil-cylinder') as NonNullable<ReturnType<TestLibrary['byId']>>;
        const before = rankedDifferential();
        const coilBefore = before.hypotheses.find((h) => h.id === 'ignition-coil-failure')?.probability ?? 0;

        const positive = bayesUpdate(before, test, { testId: test.id, outcome: 'positive', source: 'tech' }, (t, id) =>
            library.effectiveRates(t, id),
        );
        const coilAfterPositive = positive.differential.hypotheses.find(
            (h) => h.id === 'ignition-coil-failure',
        )?.probability;
        expect(coilAfterPositive).toBeGreaterThan(coilBefore);

        const negative = bayesUpdate(before, test, { testId: test.id, outcome: 'negative', source: 'tech' }, (t, id) =>
            library.effectiveRates(t, id),
        );
        const coilAfterNegative = negative.differential.hypotheses.find(
            (h) => h.id === 'ignition-coil-failure',
        )?.probability;
        expect(coilAfterNegative).toBeLessThan(coilBefore);
    });

    it('gives a hypothesis the test does not target the mean false-alarm rate', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const test = library.byId('swap-coil-cylinder') as NonNullable<ReturnType<TestLibrary['byId']>>;
        const before = rankedDifferential();
        const plugsBefore = before.hypotheses.find((h) => h.id === 'spark-plug-fouled')?.probability ?? 0;
        const updated = bayesUpdate(before, test, { testId: test.id, outcome: 'positive', source: 'tech' }, (t, id) =>
            library.effectiveRates(t, id),
        );
        // The swap targets only the coil, so the plugs take the test's
        // mean false-alarm rate (0.05) on a positive result: under
        // single-fault the plugs being true means the coil is false.
        const plugsAfter = updated.differential.hypotheses.find((h) => h.id === 'spark-plug-fouled')?.probability;
        expect(plugsAfter).toBeLessThan(plugsBefore);
        expect(plugsAfter).toBeCloseTo(0.039, 3);
        const total =
            updated.differential.hypotheses.reduce((sum, h) => sum + h.probability, 0) +
            updated.differential.otherProbability;
        expect(total).toBeCloseTo(1, 10);
    });

    it('records a trace entry per hypothesis with the rates the posterior used', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const test = library.byId('ask-misfire-conditions') as NonNullable<ReturnType<TestLibrary['byId']>>;
        const before = rankedDifferential();
        const updated = bayesUpdate(before, test, { testId: test.id, outcome: 'negative', source: 'tech' }, (t, id) =>
            library.effectiveRates(t, id),
        );
        expect(updated.trace).toHaveLength(3);
        const coilTrace = updated.trace.find((entry) => entry.hypothesisId === 'ignition-coil-failure');
        expect(coilTrace).toMatchObject({
            testId: 'ask-misfire-conditions',
            outcome: 'negative',
            hitRate: 0.7,
            falseAlarmRate: 0.35,
        });
        expect(coilTrace?.posteriorProbability).toBeCloseTo(
            updated.differential.hypotheses.find((h) => h.id === 'ignition-coil-failure')?.probability ?? 0,
            10,
        );
        // The trace recomputes the posterior: prior * (1 - hit) / total.
        // The third entry is OTHER, at the test's mean false-alarm rate;
        // the untargeted plugs hypothesis has no entry — its likelihood
        // is the mean false-alarm rate, so its posterior is its prior
        // times that rate over the same total.
        const otherTrace = updated.trace.find((entry) => entry.hypothesisId === 'other');
        expect(otherTrace?.hitRate).toBeCloseTo((0.35 + 0.3) / 2, 10);
        expect(updated.trace.some((entry) => entry.hypothesisId === 'spark-plug-fouled')).toBe(false);
        expect(updated.differential.round).toBe(before.round + 1);
    });

    it('shrinks an unverified draft test toward uninformative through the library rates', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const draft = library.byId('swap-coil-cylinder') as NonNullable<ReturnType<TestLibrary['byId']>>;
        const shrunk = { ...draft, verification: { status: 'unverified' as const, source: 'llm-draft' as const } };
        const draftLibrary = TestLibrary.fromDefinitions([
            shrunk,
            ...misfireDefinitions().filter((d) => d.id !== 'swap-coil-cylinder'),
        ]);
        const rates = draftLibrary.effectiveRates(shrunk, 'ignition-coil-failure');
        expect(rates.hitRate).toBeCloseTo(0.5 + (0.9 - 0.5) * 0.5, 10);
        expect(rates.falseAlarmRate).toBeCloseTo(0.5 + (0.05 - 0.5) * 0.5, 10);
    });
});
