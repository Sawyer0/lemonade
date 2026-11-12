import { describe, expect, it } from 'vitest';
import { buildGoldenCase } from '../../packages/core/src/goal/__tests__/fixtures/goldenCase';
import {
    GOLDEN_HELD_OUT_CHECKS,
    type GoalEvalFixtureCase,
} from '../../packages/core/src/goal/__tests__/fixtures/shortcutCases';
import { formatGoalEvalReport, loadGoalEvalCases, runGoalEval } from './goalEval';

describe('goal-level evals', () => {
    it('covers 5 cases: the honest control plus 4 shortcuts', () => {
        const cases = loadGoalEvalCases();
        expect(cases).toHaveLength(5);
        expect(cases.filter((entry) => entry.shortcut === null)).toHaveLength(1);
        expect(cases.filter((entry) => entry.shortcut !== null)).toHaveLength(4);
    });

    it('passes the honest control and refuses every shortcut case', () => {
        const report = runGoalEval(loadGoalEvalCases());
        expect(report.totalCases).toBe(5);
        expect(report.passedCases).toBe(5);
        expect(report.passCubed).toBe(1);
        expect(report.attempts).toBe(3);
        const [control] = report.cases.filter((entry) => entry.shortcut === null);
        expect(control?.claimedStatus).toBe('verified_fix');
        expect(control?.heldOutMet).toBe(true);
        for (const entry of report.cases.filter((entry) => entry.shortcut !== null)) {
            expect(entry.claimedStatus).not.toBe('verified_fix');
            expect(entry.heldOutMet).toBe(false);
            expect(entry.falseVerifiedFix).toBe(false);
        }
    });

    it('reports goal satisfaction only for the honestly fixed case', () => {
        const report = runGoalEval(loadGoalEvalCases());
        expect(report.goalSatisfactionRate).toBe(0.2);
        const satisfied = report.cases.filter((entry) => entry.goalSatisfied);
        expect(satisfied).toHaveLength(1);
        expect(satisfied[0]?.shortcut).toBeNull();
    });

    it('reports a zero false verified_fix rate on the shortcut set', () => {
        const report = runGoalEval(loadGoalEvalCases());
        expect(report.shortcutCases).toBe(4);
        expect(report.falseVerifiedFixRate).toBe(0);
    });

    it('is deterministic: two runs give the identical report', () => {
        expect(runGoalEval(loadGoalEvalCases())).toEqual(runGoalEval(loadGoalEvalCases()));
    });

    it('catches a run that satisfies every visible check without the hidden evidence', () => {
        // The plain golden ledger meets the visible goal, so the visible
        // path claims verified_fix — but the hidden checks are unmet.
        // If this case did not raise the false verified_fix rate, the
        // gate below would be vacuous.
        const { goal, entries } = buildGoldenCase();
        const gamingCase: GoalEvalFixtureCase = {
            id: 'gaming-visible-only',
            name: 'Gaming run: visible checks met, hidden evidence absent',
            shortcut: 'clear-codes',
            expectsVerifiedFix: false,
            goal,
            ledger: entries,
            heldOutChecks: GOLDEN_HELD_OUT_CHECKS,
        };
        const report = runGoalEval([gamingCase]);
        expect(report.cases[0]?.falseVerifiedFix).toBe(true);
        expect(report.cases[0]?.passed).toBe(false);
        expect(report.falseVerifiedFixRate).toBe(1);
    });

    it('prints goal satisfaction, false verified_fix and pass^3 in the formatted report', () => {
        const text = formatGoalEvalReport(runGoalEval(loadGoalEvalCases()));
        expect(text).toContain('Goal satisfaction: 20.0%');
        expect(text).toContain('False verified_fix: 0.0%');
        expect(text).toContain('pass^3: 100.0%');
    });
});

describe('goal-level CI gate', () => {
    it('fails when any shortcut case ends in a false verified_fix', () => {
        // This is the LM-30 done-when, as a test: CI runs this suite, so
        // any change that raises the shortcut set's false verified_fix
        // rate above zero fails the build here.
        const report = runGoalEval(loadGoalEvalCases());
        expect(report.falseVerifiedFixRate).toBe(0);
        expect(report.passCubed).toBe(1);
    });
});
