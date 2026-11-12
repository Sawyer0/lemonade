// Ask-as-a-test budget tests (LM-29): a question to the tech is charged
// as a test in next-best-test selection — one tech ask plus its labor
// minutes — and once the ask budget is spent the planner stops picking
// ask tests; with nothing else to run, the stop rule escalates on the
// budget, and the per-case counters stay on the loop state for the
// benchmark to report (LM-22).
import { describe, it, expect } from 'vitest';
import { BudgetSchema } from '../../../goal/goalSchema';
import { TestLibrary } from '../../tests/testLibrary';
import { buildDifferential } from '../hypotheses';
import { createLoop, applyTestResult, renderLoopSummary, plannerStateFrom, libraryRates } from '../loop';
import { planNextTest } from '../planner';
import { evaluateStop } from '../stop';
import type { DiagnosticLoopInput, DiagnosticLoopState } from '../types';
import { misfireDefinitions, misfirePriors } from './fixtures';

function budgetedInput(overrides: Partial<DiagnosticLoopInput> = {}): DiagnosticLoopInput {
    return {
        priorHypotheses: misfirePriors(),
        testDefinitions: misfireDefinitions(),
        disassemblyState: 'component-exposed',
        satisfiedPreconditionIds: ['engine-off', 'engine-cool', 'engine-off-cranks-only'],
        budget: BudgetSchema.parse({
            maxTokens: 200000,
            maxWallMinutes: 60,
            maxTestCostMinutes: 30,
            maxTechAsks: 6,
        }),
        ...overrides,
    };
}

function stateFor(
    differential: ReturnType<typeof buildDifferential>,
    overrides: Partial<DiagnosticLoopState> = {},
): DiagnosticLoopState {
    return {
        differential,
        disassemblyState: 'component-exposed',
        satisfiedPreconditionIds: ['engine-off', 'engine-cool', 'engine-off-cranks-only'],
        spentUsd: 0,
        budgetUsd: 500,
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
    return planNextTest(state.differential, library, plannerStateFrom(state), libraryRates(library));
}

describe('ask tests in next-best-test selection', () => {
    it('plans the ask test first, priced like any test', () => {
        const loop = createLoop(budgetedInput());
        expect(loop.decision?.kind).toBe('next-test');
        if (loop.decision?.kind !== 'next-test') throw new Error('expected a next-test decision');
        expect(loop.decision.nextTest.testId).toBe('ask-misfire-conditions');
        expect(loop.decision.nextTest.costTier).toBe('ask');
        // 5 labor minutes: $10 labor + $5 downtime, no parts, routine risk.
        expect(loop.decision.nextTest.cost.totalUsd).toBe(15);
        expect(loop.decision.nextTest.expectedValuePerDollar).toBeGreaterThan(0);
    });

    it('charges a recorded ask as one tech ask plus its labor minutes', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const loop = createLoop(budgetedInput());
        const afterAsk = applyTestResult(loop, library, {
            testId: 'ask-misfire-conditions',
            outcome: 'positive',
            source: 'tech',
        });
        expect(afterAsk.techAsksUsed).toBe(1);
        expect(afterAsk.spentTestMinutes).toBe(5);
        const afterMeasure = applyTestResult(afterAsk, library, {
            testId: 'measure-spark-strength',
            outcome: 'positive',
            source: 'tech',
        });
        expect(afterMeasure.techAsksUsed).toBe(1);
        expect(afterMeasure.spentTestMinutes).toBe(20);
    });

    it('stops planning ask tests once the ask budget is spent', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const loop = createLoop(
            budgetedInput({
                budget: BudgetSchema.parse({
                    maxTokens: 200000,
                    maxWallMinutes: 60,
                    maxTestCostMinutes: 30,
                    maxTechAsks: 1,
                }),
            }),
        );
        const afterAsk = applyTestResult(loop, library, {
            testId: 'ask-misfire-conditions',
            outcome: 'positive',
            source: 'tech',
        });
        expect(afterAsk.techAsksUsed).toBe(1);
        expect(afterAsk.decision?.kind).toBe('next-test');
        if (afterAsk.decision?.kind !== 'next-test') throw new Error('expected a next-test decision');
        expect(afterAsk.decision.nextTest.costTier).not.toBe('ask');
        expect(afterAsk.decision.nextTest.testId).toBe('measure-spark-strength');
    });

    it('exposes the per-case tech-ask counters on the loop state and summary', () => {
        const library = TestLibrary.fromDefinitions(misfireDefinitions());
        const loop = createLoop(
            budgetedInput({
                budget: BudgetSchema.parse({
                    maxTokens: 200000,
                    maxWallMinutes: 60,
                    maxTestCostMinutes: 30,
                    maxTechAsks: 1,
                }),
            }),
        );
        const afterAsk = applyTestResult(loop, library, {
            testId: 'ask-misfire-conditions',
            outcome: 'positive',
            source: 'tech',
        });
        expect(afterAsk.techAsksUsed).toBe(1);
        expect(afterAsk.spentTestMinutes).toBe(5);
        expect(renderLoopSummary(afterAsk)).toContain('Tech asks used 1 of 1; test minutes spent 5 of 30.');
    });
});

describe('budget exhaustion in the stop rule', () => {
    it('escalates budget-exhausted when the test minutes are spent', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            spentTestMinutes: 30,
            budget: BudgetSchema.parse({
                maxTokens: 200000,
                maxWallMinutes: 60,
                maxTestCostMinutes: 30,
                maxTechAsks: 6,
            }),
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'budget-exhausted' });
    });

    it('keeps testing while test minutes remain', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            spentTestMinutes: 29,
            budget: BudgetSchema.parse({
                maxTokens: 200000,
                maxWallMinutes: 60,
                maxTestCostMinutes: 30,
                maxTechAsks: 6,
            }),
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision.kind).toBe('next-test');
    });

    it('escalates budget-exhausted when the asks are spent and nothing else can run', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            completedTestIds: [
                'ask-misfire-conditions',
                'look-plug-coil-condition',
                'swap-coil-cylinder',
                'measure-spark-strength',
            ],
            techAsksUsed: 1,
            budget: BudgetSchema.parse({
                maxTokens: 200000,
                maxWallMinutes: 60,
                maxTestCostMinutes: 30,
                maxTechAsks: 1,
            }),
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'budget-exhausted' });
    });

    it('escalates no-discriminating-test, not budget-exhausted, when no budget is bound', () => {
        const differential = buildDifferential({ priorHypotheses: misfirePriors(), testDefinitions: [] });
        const state = stateFor(differential, {
            completedTestIds: [
                'ask-misfire-conditions',
                'look-plug-coil-condition',
                'swap-coil-cylinder',
                'measure-spark-strength',
            ],
            techAsksUsed: 1,
        });
        const decision = evaluateStop(state, { plan: planFor(state) });
        expect(decision).toMatchObject({ kind: 'escalate', reason: 'no-discriminating-test' });
    });
});
