import { evaluateGoal, type CriterionEvaluation, type GoalEvaluation } from './evaluateGoal';
import type { CaseGoal, GoalPhase, GoalStatus } from './goalSchema';
import type { LedgerEntry } from '../types/case';
import type { LoopDecision } from '../diagnosis/loop/types';
import type { ReasonerRegionResult } from '../reasoning/types';

// --- Goal-driven phase gates and terminal states (LM-26) ---
// The mechanic machine advances through the goal's phases (intake,
// differentiate, test, commit, repair, verify) only when the phase's
// blocking criteria are met, judged by LM-25's evaluateGoal over the case
// ledger. When a phase cannot advance, or the run finishes, the case ends
// in exactly one named terminal status. This module is pure and
// deterministic: same goal + ledger + usage + signals, same terminal.
//
// Terminal precedence, hardest fact first: a safety stop beats a spent
// budget; a spent budget beats an abstention; an abstention beats a
// verified fix (the run explicitly declined to conclude); a verified fix
// beats an escalation (the evidence proves the fix whatever the process
// did); anything else that differentiated is diagnosed but unverified.
//
// Note the goal-level terminal list (TERMINAL_GOAL_STATUSES in
// evaluateGoal.ts) deliberately omits 'budget_limited': a budget-limited
// goal is a hold the harness may resume, not a terminal goal. The machine
// still ends its run in budget_limited — machine-final is not
// goal-terminal.

/** The six terminal statuses a machine run can end in. */
export type TerminalGoalStatus =
    'verified_fix' | 'diagnosed_unverified' | 'abstained' | 'safety_stopped' | 'escalated' | 'budget_limited';

/** Budget the run has spent so far, in the goal budget's own units. */
export interface BudgetUsage {
    /** Reasoner loop runs completed in this case. */
    reasonerRuns: number;
    /** Model tokens spent in this case. */
    tokensUsed: number;
    /** Wall-clock minutes spent in this case, as measured by the caller. */
    wallMinutesUsed: number;
    /** Tech minutes spent running tests in this case. */
    testCostMinutesUsed: number;
}

export const EMPTY_BUDGET_USAGE: BudgetUsage = {
    reasonerRuns: 0,
    tokensUsed: 0,
    wallMinutesUsed: 0,
    testCostMinutesUsed: 0,
};

/** A safety stop raised during the run: why, and the hazard when known. */
export interface SafetyStopSignal {
    reason: string;
    hazard?: string;
}

/**
 * What an abstaining run hands over (LM-19's judge sends this shape):
 * what the run established, and what it could not establish. The
 * abstained terminal state carries it in machine context.
 */
export interface AbstainHandoff {
    reason: string;
    known: string[];
    unknown: string[];
}

/** The blocking criteria of one phase, and whether they are all met. */
export interface PhaseEvaluation {
    phase: GoalPhase;
    evaluation: GoalEvaluation;
    blocking: CriterionEvaluation[];
    unmetBlocking: CriterionEvaluation[];
    /** Every blocking criterion of the phase is met (vacuously when none). */
    met: boolean;
}

/** The blocking criteria of `phase`, in goal order. */
export function phaseCriteria(goal: CaseGoal, phase: GoalPhase): CaseGoal['criteria'][number][] {
    return goal.criteria.filter((criterion) => criterion.phase === phase);
}

/**
 * Judges one phase: every blocking criterion of the phase must be met.
 * Non-blocking criteria never gate advancement, matching evaluateGoal's
 * blockingMet. A phase with no blocking criteria is met vacuously, so a
 * goal that only constrains some phases lets the others through.
 */
export function evaluatePhase(goal: CaseGoal, ledger: ReadonlyArray<LedgerEntry>, phase: GoalPhase): PhaseEvaluation {
    const evaluation = evaluateGoal(goal, ledger);
    const blocking = evaluation.criteria.filter((criterion) => criterion.phase === phase && criterion.blocking);
    const unmetBlocking = blocking.filter((criterion) => criterion.verdict !== 'met');
    return { phase, evaluation, blocking, unmetBlocking, met: unmetBlocking.length === 0 };
}

/** Whether the spent budget exceeds any dimension of the goal's budget. */
export function budgetExceeded(goal: CaseGoal, usage: BudgetUsage): { exceeded: boolean; reason: string } {
    const budget = goal.budget;
    if (usage.reasonerRuns > budget.maxReasonerRuns) {
        return {
            exceeded: true,
            reason: `reasoner runs ${usage.reasonerRuns} exceed goal budget ${budget.maxReasonerRuns}`,
        };
    }
    if (usage.tokensUsed > budget.maxTokens) {
        return {
            exceeded: true,
            reason: `tokens used ${usage.tokensUsed} exceed goal budget ${budget.maxTokens}`,
        };
    }
    if (usage.wallMinutesUsed > budget.maxWallMinutes) {
        return {
            exceeded: true,
            reason: `wall minutes ${usage.wallMinutesUsed} exceed goal budget ${budget.maxWallMinutes}`,
        };
    }
    if (usage.testCostMinutesUsed > budget.maxTestCostMinutes) {
        return {
            exceeded: true,
            reason: `test minutes ${usage.testCostMinutesUsed} exceed goal budget ${budget.maxTestCostMinutes}`,
        };
    }
    return { exceeded: false, reason: 'within budget' };
}

export interface TerminalResolutionInput {
    goal?: CaseGoal;
    ledger: ReadonlyArray<LedgerEntry>;
    budgetUsage: BudgetUsage;
    safetyStop?: SafetyStopSignal;
    abstain?: AbstainHandoff;
    loopDecision?: LoopDecision | null;
    reasonerResult?: ReasonerRegionResult;
}

export interface TerminalResolution {
    status: TerminalGoalStatus;
    reason: string;
}

/** One line naming the unmet blocking criteria, for the honest ending. */
function unmetSummary(evaluation: GoalEvaluation): string {
    const unmet = evaluation.criteria.filter((criterion) => criterion.blocking && criterion.verdict !== 'met');
    if (unmet.length === 0) {
        return 'blocking criteria met but a non-blocking criterion is unmet';
    }
    return `unmet criteria: ${unmet.map((criterion) => `${criterion.criterionId} (${criterion.reason})`).join('; ')}`;
}

/**
 * Resolves the run's one terminal status. Total: every input lands in
 * exactly one of the six statuses. A case with no re-test can never land
 * in verified_fix: the verify phase's pre-registered-test criterion stays
 * unmet without a passing test_result after goal_set, so allMet is false
 * and the case settles as diagnosed_unverified (when it differentiated)
 * or escalated (when it did not).
 */
export function resolveTerminalStatus(input: TerminalResolutionInput): TerminalResolution {
    const { goal, ledger, budgetUsage, safetyStop, abstain, loopDecision, reasonerResult } = input;

    if (safetyStop !== undefined) {
        return { status: 'safety_stopped', reason: `safety stop: ${safetyStop.reason}` };
    }
    if (ledger.some((entry) => entry.type === 'safety_stop')) {
        return { status: 'safety_stopped', reason: 'ledger records a safety stop' };
    }
    if (reasonerResult?.endState === 'safety_stop') {
        return { status: 'safety_stopped', reason: `reasoner stopped for safety: ${reasonerResult.endReason}` };
    }
    if (loopDecision?.kind === 'escalate' && loopDecision.reason === 'safety-critical-unresolved') {
        return { status: 'safety_stopped', reason: `workup escalated: ${loopDecision.detail}` };
    }

    if (goal !== undefined) {
        const exceeded = budgetExceeded(goal, budgetUsage);
        if (exceeded.exceeded) {
            return { status: 'budget_limited', reason: exceeded.reason };
        }
    }
    if (reasonerResult?.endState === 'budget') {
        return { status: 'budget_limited', reason: `reasoner ended on budget: ${reasonerResult.endReason}` };
    }

    if (abstain !== undefined) {
        return { status: 'abstained', reason: abstain.reason };
    }

    if (goal !== undefined) {
        const evaluation = evaluateGoal(goal, ledger);
        if (evaluation.allMet) {
            return {
                status: 'verified_fix',
                reason: 'every goal criterion is met, including the pre-registered re-test',
            };
        }
        if (loopDecision?.kind === 'escalate') {
            return {
                status: 'escalated',
                reason: `workup escalated (${loopDecision.reason}): ${loopDecision.detail}`,
            };
        }
        if (reasonerResult?.endState === 'needs_tech' || reasonerResult?.endState === 'max_steps') {
            return {
                status: 'escalated',
                reason: `reasoner ended ${reasonerResult.endState}: ${reasonerResult.endReason}`,
            };
        }
        const differentiate = evaluatePhase(goal, ledger, 'differentiate');
        if (!differentiate.met) {
            const unmet = differentiate.unmetBlocking.map((criterion) => criterion.criterionId).join(', ');
            return { status: 'escalated', reason: `differentiate criteria unmet: ${unmet}` };
        }
        return { status: 'diagnosed_unverified', reason: unmetSummary(evaluation) };
    }

    if (loopDecision?.kind === 'escalate') {
        return {
            status: 'escalated',
            reason: `workup escalated (${loopDecision.reason}): ${loopDecision.detail}`,
        };
    }
    if (reasonerResult?.endState === 'needs_tech' || reasonerResult?.endState === 'max_steps') {
        return {
            status: 'escalated',
            reason: `reasoner ended ${reasonerResult.endState}: ${reasonerResult.endReason}`,
        };
    }
    return {
        status: 'diagnosed_unverified',
        reason: 'no goal was set for this run, so nothing is proven verified',
    };
}

/** Type guard for the machine's terminal states, shared with the service. */
export function isTerminalGoalStatus(status: GoalStatus): status is TerminalGoalStatus {
    return (
        status === 'verified_fix' ||
        status === 'diagnosed_unverified' ||
        status === 'abstained' ||
        status === 'safety_stopped' ||
        status === 'escalated' ||
        status === 'budget_limited'
    );
}
