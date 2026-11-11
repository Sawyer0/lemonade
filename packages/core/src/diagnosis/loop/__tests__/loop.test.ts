// Golden case (LM-04): a P0300 misfire worked end to end — priors in,
// loop rounds, re-ranks after each recorded result, expected-cost
// optimal next test, challenger, stop/escalate, close-out.
import { describe, it, expect } from 'vitest';
import { InMemoryFixCountStore } from '../../priors/store';
import { TestLibrary } from '../../tests/testLibrary';
import { createLoop, applyTestResult, closeOutLoop, renderLoopSummary, loopIsTerminal } from '../loop';
import { misfireDefinitions, misfirePriors } from './fixtures';

async function seededPriors() {
    const store = new InMemoryFixCountStore();
    await store.recordFixes([
        {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0300'],
            hypothesis: 'ignition-coil-failure',
            observationCount: 7,
            sourceCounts: { autorepairbench: 7 },
        },
        {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0300'],
            hypothesis: 'spark-plug-fouled',
            observationCount: 5,
            sourceCounts: { autorepairbench: 5 },
        },
        {
            vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
            dtcs: ['P0300'],
            hypothesis: 'misfire-cylinder-3',
            observationCount: 2,
            sourceCounts: { autorepairbench: 2 },
        },
    ]);
    const result = await store.prior({
        vehicle: { make: 'Honda', model: 'Civic', yearFrom: 2015, yearTo: 2015, engine: '1.8L' },
        dtcs: ['P0300'],
    });
    return result.hypotheses;
}

function goldenInput() {
    return {
        priorHypotheses: misfirePriors(),
        testDefinitions: misfireDefinitions(),
        disassemblyState: 'component-exposed' as const,
        satisfiedPreconditionIds: ['engine-off', 'engine-cool', 'engine-off-cranks-only'],
    };
}

describe('diagnostic loop golden case', () => {
    it('builds priors from the fix-count store with counts and sources', async () => {
        const priors = await seededPriors();
        expect(priors[0]).toMatchObject({ hypothesis: 'ignition-coil-failure', n: 7, pi: 8 / 17 });
        expect(priors[0]?.sources).toEqual([{ source: 'autorepairbench', observationCount: 7 }]);
    });

    it('loops: re-ranks after each recorded result, plans the cost-optimal test, offers a challenger', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const loop = createLoop(goldenInput());
        expect(loop.differential.hypotheses[0]?.id).toBe('ignition-coil-failure');
        expect(loop.decision?.kind).toBe('next-test');
        if (loop.decision?.kind !== 'next-test') throw new Error('expected a next-test decision');
        expect(loop.decision.nextTest.testId).toBe('ask-misfire-conditions');
        expect(loop.decision.challenger?.testId).toBe('measure-spark-strength');

        // Round 1: the driver says the shake is only under load. The ask
        // test targets coil and cylinder-3, not the plugs — so the plugs
        // take the lead on renormalisation alone.
        const round1 = applyTestResult(loop, library, {
            testId: 'ask-misfire-conditions',
            outcome: 'positive',
            source: 'tech',
        });
        expect(round1.differential.round).toBe(1);
        expect(round1.differential.hypotheses[0]?.id).toBe('spark-plug-fouled');
        expect(round1.spentUsd).toBeCloseTo(15, 10);
        expect(round1.completedTestIds).toEqual(['ask-misfire-conditions']);
        expect(round1.decision?.kind).toBe('next-test');
        if (round1.decision?.kind !== 'next-test') throw new Error('expected a next-test decision');
        expect(round1.decision.nextTest.testId).toBe('measure-spark-strength');

        // Round 2: spark is strong on the tester. Both coil and plugs
        // stay close — neither clears the commit threshold.
        const round2 = applyTestResult(round1, library, {
            testId: 'measure-spark-strength',
            outcome: 'positive',
            source: 'tech',
        });
        expect(round2.differential.round).toBe(2);
        const coil = round2.differential.hypotheses.find((h) => h.id === 'ignition-coil-failure')?.probability ?? 0;
        const plugs = round2.differential.hypotheses.find((h) => h.id === 'spark-plug-fouled')?.probability ?? 0;
        expect(Math.abs(coil - plugs)).toBeLessThan(0.05);
        expect(round2.decision?.kind).toBe('next-test');

        // The trace records every number the loop used.
        expect(round2.history.length).toBeGreaterThan(0);
        for (const entry of round2.history) {
            expect(entry.hitRate).toBeGreaterThan(entry.falseAlarmRate);
        }
    });

    it('escalates when the tests run out without a commit', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        let loop = createLoop(goldenInput());
        for (const testId of ['ask-misfire-conditions', 'measure-spark-strength', 'look-plug-coil-condition', 'swap-coil-cylinder']) {
            loop = applyTestResult(loop, library, { testId, outcome: 'negative', source: 'tech' });
            if (loopIsTerminal(loop)) break;
        }
        expect(loop.decision?.kind).toBe('escalate');
    });

    it('throws on a result for a test the library does not know', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const loop = createLoop(goldenInput());
        expect(() =>
            applyTestResult(loop, library, { testId: 'no-such-test', outcome: 'positive', source: 'tech' }),
        ).toThrow('Unknown test in loop result');
    });

    it('closes only after the fix verifies, and escalates when it does not', () => {
        const committed = createLoop({
            ...goldenInput(),
            priorHypotheses: [{ hypothesis: 'ignition-coil-failure', n: 30, q: 1, pi: 1, sources: [] }],
        });
        expect(committed.decision?.kind).toBe('repair');
        const closed = closeOutLoop(committed, true);
        expect(closed.decision).toEqual({ kind: 'closed', hypothesisId: 'ignition-coil-failure' });
        expect(closed.repairedHypothesisId).toBe('ignition-coil-failure');

        const reopened = closeOutLoop(committed, false);
        expect(reopened.decision).toMatchObject({ kind: 'escalate', reason: 'evidence-inconsistent' });
    });

    it('refuses close-out before the loop commits to a repair', () => {
        const loop = createLoop(goldenInput());
        expect(() => closeOutLoop(loop, true)).toThrow('Close-out needs a repair decision');
    });

    it('renders a summary the live agent can read from the case record', () => {
        const loop = createLoop(goldenInput());
        const summary = renderLoopSummary(loop);
        expect(summary).toContain('ignition-coil-failure: 44.7%');
        expect(summary).toContain('OTHER (unlisted cause): 5.0%');
        expect(summary).toContain('Next test: Ask when the misfire happens');
        expect(summary).toContain('Challenger (could disprove the leader): Measure spark at the plug');
    });
});
