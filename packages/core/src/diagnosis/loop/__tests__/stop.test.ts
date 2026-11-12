import { describe, it, expect } from 'vitest';
import { SHARED_CONFIG } from '../../../config';
import { TestLibrary } from '../../tests/testLibrary';
import { buildDifferential } from '../hypotheses';
import { planNextTest } from '../planner';
import { libraryRates } from '../loop';
import { evaluateStop, expectedRepairCostUsd } from '../stop';
import type { DiagnosticLoopState } from '../types';
import { misfireDefinitions, misfirePriors } from './fixtures';

const LOOP = SHARED_CONFIG.DIAGNOSTIC_LOOP;

function stateFor(
    differential: ReturnType<typeof buildDifferential>,
    overrides: Partial<DiagnosticLoopState> = {},
): DiagnosticLoopState {
    return {
        differential,
        disassemblyState: 'component-exposed',
        satisfiedPreconditionIds: ['engine-off', 'engine-cool', 'engine-off-cranks-only'],
        spentUsd: 0,
        budgetUsd: LOOP.DEFAULT_BUDGET_USD,
        safetyCriticalHypothesisIds: [],
        repairCostsUsd: {},
        completedTestIds: [],
        history: [],
        decision: null,
        techAsksUsed: 0,
        spentTestMinutes: 0,
        ...overrides,
    };
}

function planFor(state: DiagnosticLoopState) {
    const library = TestLibrary.fromDefinitions(misfireDefinitions());
    return planNextTest(
        state.differential,
        library,
        {
            disassemblyState: state.disassemblyState,
            satisfiedPreconditionIds: new Set(state.satisfiedPreconditionIds),
            completedTestIds: new Set(state.completedTestIds),
        },
        libraryRates(library),
    );
}

describe('expectedRepairCostUsd', () => {
    it('charges the repair plus the cost of being wrong', () => {
        expect(expectedRepairCostUsd(0.8, 200, 100)).toBeCloseTo(220, 10);
        expect(expectedRepairCostUsd(1, 200, 100)).toBeCloseTo(200, 10);
    });
});

describe('evaluateStop', () => {
    it('commits when the top probability clears the threshold', () => {
        const differential = buildDifferential({
            priorHypotheses: [{ hypothesis: 'the-fault', n: 30, q: 1, pi: 1, sources: [] }],
            testDefinitions: [],
        });
        const state = stateFor(differential);
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision.kind).toBe('repair');
        if (decision.kind === 'repair') {
            expect(decision.hypothesisId).toBe('the-fault');
        }
    });

    it('commits when repairing now is cheaper than the best test, even below the threshold', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, { repairCostsUsd: { 'ignition-coil-failure': 10 } });
        const decision = evaluateStop(state, { plan: planFor(state) });
        // Repair $10 + 55% of the $65 test = $46 < $65 to resolve.
        expect(decision.kind).toBe('repair');
    });

    it('keeps testing when the leader is below the threshold and a test is cheaper than the repair', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, { repairCostsUsd: { 'ignition-coil-failure': 500 } });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision.kind).toBe('next-test');
        if (decision.kind === 'next-test') {
            expect(decision.nextTest.testId).toBe('ask-misfire-conditions');
            expect(decision.challenger?.testId).toBe('measure-spark-strength');
        }
    });

    it('escalates when OTHER exceeds ~25%', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor({ ...differential, otherProbability: 0.3 });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'other-too-high' });
    });

    it('escalates when every cause was ruled out', () => {
        const state = stateFor({ hypotheses: [], otherProbability: 1, round: 2 });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'evidence-inconsistent' });
    });

    it('escalates when the budget is spent', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, { spentUsd: 500, budgetUsd: 500 });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'budget-exhausted' });
    });

    it('escalates when the round cap is hit', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor({ ...differential, round: LOOP.MAX_ROUNDS });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'rounds-exhausted' });
    });

    it('blocks a commit while another safety-critical cause stays above ~1%', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            repairCostsUsd: { 'ignition-coil-failure': 10 },
            safetyCriticalHypothesisIds: ['spark-plug-fouled'],
        });
        // The cheap repair would commit, but plugs (33%) is safety-critical.
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision.kind).toBe('next-test');
    });

    it('escalates when a safety-critical cause stays unresolved and no test is left', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            safetyCriticalHypothesisIds: ['spark-plug-fouled'],
            completedTestIds: [
                'ask-misfire-conditions',
                'look-plug-coil-condition',
                'swap-coil-cylinder',
                'measure-spark-strength',
            ],
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'safety-critical-unresolved' });
    });

    it('escalates when no test is left at all', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            completedTestIds: [
                'ask-misfire-conditions',
                'look-plug-coil-condition',
                'swap-coil-cylinder',
                'measure-spark-strength',
            ],
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'no-discriminating-test' });
    });
});
