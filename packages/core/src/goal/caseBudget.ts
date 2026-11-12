// Per-case budget enforcement and the budget-exhaustion abstain handoff
// (LM-29): the goal's `Budget` fields are system-owned limits, never
// "done". The harness reports what the case has spent; this module says
// which limit (if any) is exhausted, and turns an exhaustion into the
// abstain handoff: the goal moves to `budget_limited` with system
// authority, and the handoff lists what is known and what is still
// unknown, with no diagnosis to speak. A budget limit is never a
// verdict about the car — it is a statement that the run cannot go on.
import type { LedgerEntry } from '../types/case';
import { evaluateGoal, transitionGoalStatus } from './evaluateGoal';
import type { Budget, CaseGoal, GoalStatusChangedPayload } from './goalSchema';

/** What the case has spent, in the goal budget's own units. */
export interface CaseBudgetUsage {
    techAsksUsed: number;
    testCostMinutesUsed: number;
    reasonerRunsUsed: number;
    tokensUsed: number;
    wallMinutesUsed: number;
}

/** One field of the goal's `Budget`, named as the handoff names it. */
export type BudgetLimit =
    | 'maxTechAsks'
    | 'maxTestCostMinutes'
    | 'maxReasonerRuns'
    | 'maxTokens'
    | 'maxWallMinutes';

export interface BudgetExhaustion {
    exhausted: boolean;
    limit?: BudgetLimit;
    detail: string;
}

const LIMIT_COPY: Record<BudgetLimit, { used: (usage: CaseBudgetUsage) => number; cap: (budget: Budget) => number; label: string }> = {
    maxTechAsks: {
        used: (usage) => usage.techAsksUsed,
        cap: (budget) => budget.maxTechAsks,
        label: 'Tech asks',
    },
    maxTestCostMinutes: {
        used: (usage) => usage.testCostMinutesUsed,
        cap: (budget) => budget.maxTestCostMinutes,
        label: 'Test time',
    },
    maxReasonerRuns: {
        used: (usage) => usage.reasonerRunsUsed,
        cap: (budget) => budget.maxReasonerRuns,
        label: 'Reasoner runs',
    },
    maxTokens: {
        used: (usage) => usage.tokensUsed,
        cap: (budget) => budget.maxTokens,
        label: 'Tokens',
    },
    maxWallMinutes: {
        used: (usage) => usage.wallMinutesUsed,
        cap: (budget) => budget.maxWallMinutes,
        label: 'Wall time',
    },
};

/** The first exhausted limit wins, in the fixed order above. */
const LIMIT_ORDER: ReadonlyArray<BudgetLimit> = [
    'maxTechAsks',
    'maxTestCostMinutes',
    'maxReasonerRuns',
    'maxTokens',
    'maxWallMinutes',
];

/**
 * Checks the case's spend against the goal's budget. A limit is exhausted
 * when the spend reaches it: the budget is spent, not over-spent, before
 * the run must stop.
 */
export function checkCaseBudget(budget: Budget, usage: CaseBudgetUsage): BudgetExhaustion {
    for (const limit of LIMIT_ORDER) {
        const spent = LIMIT_COPY[limit].used(usage);
        const cap = LIMIT_COPY[limit].cap(budget);
        if (spent >= cap) {
            return {
                exhausted: true,
                limit,
                detail: `${LIMIT_COPY[limit].label} spent: ${spent} of ${cap} budgeted.`,
            };
        }
    }
    return { exhausted: false, detail: 'Budget not exhausted.' };
}

/**
 * The abstain handoff for a budget-exhausted case. Known items are the
 * goal criteria the ledger proves; unknown items are the criteria it
 * does not. `diagnosis` is always null: an abstain never speaks a
 * diagnosis, so there is no diagnosis string for the talker to read.
 */
export interface BudgetAbstainHandoff {
    goalId: string;
    caseId: string;
    exhaustedLimit: BudgetLimit;
    detail: string;
    knownItems: string[];
    unknownItems: string[];
    diagnosis: null;
    /** The `goal_status_changed` payload the caller appends to the ledger: goal to `budget_limited`, system-owned. */
    statusChange: GoalStatusChangedPayload;
}

/**
 * Turns a budget exhaustion into the abstain handoff. When nothing is
 * exhausted the goal is returned unchanged and there is no handoff: an
 * abstain is only ever built from a real exhaustion. A terminal goal
 * throws through the status transition rather than abstaining twice.
 */
export function exhaustBudget(
    goal: CaseGoal,
    ledger: ReadonlyArray<LedgerEntry>,
    usage: CaseBudgetUsage,
): { goal: CaseGoal; handoff: BudgetAbstainHandoff | undefined } {
    const exhaustion = checkCaseBudget(goal.budget, usage);
    if (!exhaustion.exhausted || exhaustion.limit === undefined) {
        return { goal, handoff: undefined };
    }
    const limited = transitionGoalStatus(goal, 'budget_limited', 'system');
    const evaluation = evaluateGoal(goal, ledger);
    const knownItems: string[] = [];
    const unknownItems: string[] = [];
    for (const criterion of evaluation.criteria) {
        const description = goal.criteria.find(
            (candidate) => candidate.id === criterion.criterionId,
        )?.description;
        if (description === undefined) {
            continue;
        }
        if (criterion.verdict === 'met') {
            knownItems.push(description);
        } else {
            unknownItems.push(description);
        }
    }
    return {
        goal: limited,
        handoff: {
            goalId: goal.goalId,
            caseId: goal.caseId,
            exhaustedLimit: exhaustion.limit,
            detail: exhaustion.detail,
            knownItems,
            unknownItems,
            diagnosis: null,
            statusChange: {
                goalId: goal.goalId,
                from: goal.status,
                to: 'budget_limited',
                authority: 'system',
                reason: exhaustion.detail,
            },
        },
    };
}
