import { evaluateGoalLevel, type TerminalGoalStatus } from '@lemonade/core';
import {
    loadGoalEvalCases as loadFixtureCases,
    type GoalEvalFixtureCase,
} from '../../packages/core/src/goal/__tests__/fixtures/shortcutCases';

// --- Goal-level evals (LM-30) ---
// Extends the LM-22 benchmark: each benchmark case carries hidden
// ground-truth checks the reasoner can't see, and the report adds the
// goal-satisfaction rate and the false verified_fix rate next to pass^3.
// A case passes when its goal-level verdict is correct: the honest
// control must end verified_fix with every held-out check met, and a
// shortcut case must not end verified_fix at all. The false
// verified_fix rate is measured over the shortcut set only: a shortcut
// that fools the visible criteria into claiming a verified fix the
// hidden checks do not support.

export interface GoalEvalCaseResult {
    caseId: string;
    name: string;
    shortcut: GoalEvalFixtureCase['shortcut'];
    expectsVerifiedFix: boolean;
    goalSatisfied: boolean;
    heldOutMet: boolean;
    claimedStatus: TerminalGoalStatus;
    falseVerifiedFix: boolean;
    passed: boolean;
    passedAllAttempts: boolean;
}

export interface GoalEvalReport {
    totalCases: number;
    shortcutCases: number;
    passedCases: number;
    /** Share of cases whose visible goal criteria are all met. */
    goalSatisfactionRate: number;
    /** Share of shortcut cases ending in a false verified_fix. */
    falseVerifiedFixRate: number;
    /** pass^k: share of cases passing every one of k attempts. */
    passCubed: number;
    attempts: number;
    cases: GoalEvalCaseResult[];
}

/** One attempt at one case: the goal-level verdict, and whether it is correct. */
function attemptCase(goalCase: GoalEvalFixtureCase): Omit<GoalEvalCaseResult, 'passedAllAttempts'> {
    const verdict = evaluateGoalLevel({
        goal: goalCase.goal,
        heldOutChecks: goalCase.heldOutChecks,
        ledger: goalCase.ledger,
    });
    const passed = goalCase.expectsVerifiedFix
        ? verdict.claimedStatus === 'verified_fix' && verdict.heldOutAllMet
        : verdict.claimedStatus !== 'verified_fix' && !verdict.falseVerifiedFix;
    return {
        caseId: goalCase.id,
        name: goalCase.name,
        shortcut: goalCase.shortcut,
        expectsVerifiedFix: goalCase.expectsVerifiedFix,
        goalSatisfied: verdict.visibleAllMet,
        heldOutMet: verdict.heldOutAllMet,
        claimedStatus: verdict.claimedStatus,
        falseVerifiedFix: verdict.falseVerifiedFix,
        passed,
    };
}

/**
 * The goal-level benchmark: every case through the goal-level verdict,
 * each case attempted k times. The verdicts are deterministic, so
 * attempts agree; pass^k still reports the honest share passing all k
 * runs, and would drop below accuracy the moment a run disagrees.
 */
export function runGoalEval(goalCases: GoalEvalFixtureCase[], attempts: number = 3): GoalEvalReport {
    const cases: GoalEvalCaseResult[] = goalCases.map((goalCase) => {
        const runs = Array.from({ length: attempts }, () => attemptCase(goalCase));
        const first = runs[0];
        if (first === undefined) {
            throw new Error(`Goal eval ran zero attempts for ${goalCase.id}`);
        }
        return { ...first, passedAllAttempts: runs.every((run) => run.passed) };
    });
    const totalCases = cases.length;
    const shortcutCases = cases.filter((entry) => entry.shortcut !== null);
    const falseVerified = shortcutCases.filter((entry) => entry.falseVerifiedFix).length;
    const passedCases = cases.filter((entry) => entry.passed).length;
    const passedAll = cases.filter((entry) => entry.passedAllAttempts).length;
    const satisfied = cases.filter((entry) => entry.goalSatisfied).length;
    return {
        totalCases,
        shortcutCases: shortcutCases.length,
        passedCases,
        goalSatisfactionRate: totalCases === 0 ? 0 : satisfied / totalCases,
        falseVerifiedFixRate: shortcutCases.length === 0 ? 0 : falseVerified / shortcutCases.length,
        passCubed: totalCases === 0 ? 0 : passedAll / totalCases,
        attempts,
        cases,
    };
}

/** The goal-level benchmark set: the honest control plus the shortcut set. */
export function loadGoalEvalCases(): GoalEvalFixtureCase[] {
    return loadFixtureCases();
}

export function formatGoalEvalReport(report: GoalEvalReport): string {
    const lines = [
        '--- Goal-Level Evals (LM-30) ---',
        `Cases: ${report.totalCases} (${report.shortcutCases} shortcuts)  ` +
            `Goal satisfaction: ${(report.goalSatisfactionRate * 100).toFixed(1)}%  ` +
            `False verified_fix: ${(report.falseVerifiedFixRate * 100).toFixed(1)}%  ` +
            `pass^${report.attempts}: ${(report.passCubed * 100).toFixed(1)}%`,
    ];
    for (const entry of report.cases) {
        const mark = entry.passed ? 'PASS' : 'FAIL';
        const heldOut = entry.heldOutMet ? 'held-out met' : 'held-out MISS';
        const falseFix = entry.falseVerifiedFix ? ' FALSE verified_fix' : '';
        lines.push(
            `${mark} ${entry.caseId} ${entry.name} ` +
                `(claimed ${entry.claimedStatus}, goal ${entry.goalSatisfied ? 'satisfied' : 'unsatisfied'}, ` +
                `${heldOut}${falseFix})`,
        );
    }
    return lines.join('\n');
}
