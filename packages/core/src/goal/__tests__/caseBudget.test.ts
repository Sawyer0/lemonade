// Budget-exhaustion abstain tests (LM-29): running out of any Budget
// field ends in an abstain handoff — the goal moves to `budget_limited`,
// owned by the system, and the handoff lists what is known and what is
// still unknown, with no diagnosis to speak.
import { describe, it, expect } from 'vitest';
import { transitionGoalStatus } from '../evaluateGoal';
import { checkCaseBudget, exhaustBudget, type CaseBudgetUsage } from '../caseBudget';
import { buildGoldenCase } from './fixtures/goldenCase';

function usage(overrides: Partial<CaseBudgetUsage> = {}): CaseBudgetUsage {
    return {
        techAsksUsed: 0,
        testCostMinutesUsed: 0,
        reasonerRunsUsed: 0,
        tokensUsed: 0,
        wallMinutesUsed: 0,
        ...overrides,
    };
}

describe('checkCaseBudget', () => {
    it('is not exhausted while every field has room', () => {
        const { goal } = buildGoldenCase();
        expect(checkCaseBudget(goal.budget, usage())).toEqual({ exhausted: false, detail: 'Budget not exhausted.' });
    });

    it('names the tech-ask limit when the asks are spent', () => {
        const { goal } = buildGoldenCase();
        const exhaustion = checkCaseBudget(goal.budget, usage({ techAsksUsed: 6 }));
        expect(exhaustion).toEqual({
            exhausted: true,
            limit: 'maxTechAsks',
            detail: 'Tech asks spent: 6 of 6 budgeted.',
        });
    });

    it('names the test-time limit when the test minutes are spent', () => {
        const { goal } = buildGoldenCase();
        const exhaustion = checkCaseBudget(goal.budget, usage({ testCostMinutesUsed: 30 }));
        expect(exhaustion).toEqual({
            exhausted: true,
            limit: 'maxTestCostMinutes',
            detail: 'Test time spent: 30 of 30 budgeted.',
        });
    });

    it('names the reasoner-run limit when the runs are spent', () => {
        const { goal } = buildGoldenCase();
        const exhaustion = checkCaseBudget(goal.budget, usage({ reasonerRunsUsed: 8 }));
        expect(exhaustion).toEqual({
            exhausted: true,
            limit: 'maxReasonerRuns',
            detail: 'Reasoner runs spent: 8 of 8 budgeted.',
        });
    });

    it('names the token limit when the tokens are spent', () => {
        const { goal } = buildGoldenCase();
        const exhaustion = checkCaseBudget(goal.budget, usage({ tokensUsed: 200000 }));
        expect(exhaustion).toEqual({
            exhausted: true,
            limit: 'maxTokens',
            detail: 'Tokens spent: 200000 of 200000 budgeted.',
        });
    });

    it('names the wall-time limit when the wall minutes are spent', () => {
        const { goal } = buildGoldenCase();
        const exhaustion = checkCaseBudget(goal.budget, usage({ wallMinutesUsed: 60 }));
        expect(exhaustion).toEqual({
            exhausted: true,
            limit: 'maxWallMinutes',
            detail: 'Wall time spent: 60 of 60 budgeted.',
        });
    });
});

describe('exhaustBudget', () => {
    it('returns the goal unchanged with no handoff while the budget holds', () => {
        const { goal, entries } = buildGoldenCase();
        const { goal: returned, handoff } = exhaustBudget(goal, entries, usage());
        expect(handoff).toBeUndefined();
        expect(returned).toBe(goal);
    });

    it('moves the goal to budget_limited, owned by the system, with a handoff', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const { goal: limited, handoff } = exhaustBudget(goal, entries, usage({ techAsksUsed: 6 }));
        expect(limited.status).toBe('budget_limited');
        expect(limited.statusAuthority).toBe('system');
        expect(handoff?.exhaustedLimit).toBe('maxTechAsks');
        expect(handoff?.detail).toBe('Tech asks spent: 6 of 6 budgeted.');
        expect(handoff?.statusChange).toEqual({
            goalId: goal.goalId,
            from: 'active',
            to: 'budget_limited',
            authority: 'system',
            reason: 'Tech asks spent: 6 of 6 budgeted.',
        });
    });

    it('lists what is known and what is still unknown, and never a diagnosis', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
        const { handoff } = exhaustBudget(goal, entries, usage({ tokensUsed: 200000 }));
        expect(handoff?.exhaustedLimit).toBe('maxTokens');
        // Only the posterior criterion is met: the sharp leading hypothesis
        // is known, the re-test and the symptom check are still unknown.
        expect(handoff?.knownItems).toEqual(['One root-cause hypothesis leads the posterior by a clear margin']);
        expect(handoff?.unknownItems).toEqual([
            'Pre-registered compression re-test passes after the repair',
            'No misfire at idle after the repair',
        ]);
        expect(handoff?.diagnosis).toBeNull();
    });

    it('lists everything as known when the ledger already proves it all', () => {
        const { goal, entries } = buildGoldenCase();
        const { handoff } = exhaustBudget(goal, entries, usage({ wallMinutesUsed: 60 }));
        expect(handoff?.knownItems).toHaveLength(3);
        expect(handoff?.unknownItems).toEqual([]);
        expect(handoff?.diagnosis).toBeNull();
    });

    it('refuses to abstain a goal that is already terminal', () => {
        const { goal, entries } = buildGoldenCase();
        const abstained = transitionGoalStatus(goal, 'abstained', 'code');
        expect(() => exhaustBudget(abstained, entries, usage({ techAsksUsed: 6 }))).toThrow(
            'A goal in terminal status abstained cannot move to budget_limited',
        );
    });
});
