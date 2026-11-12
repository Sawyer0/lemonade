import { evaluateCriteria, evaluateGoal, type CriterionEvaluation } from './evaluateGoal';
import { EMPTY_BUDGET_USAGE, resolveTerminalStatus, type BudgetUsage, type TerminalGoalStatus } from './phaseGate';
import type { CaseGoal, Criterion, CriterionCheck } from './goalSchema';
import type { AbstainHandoff } from '../diagnosis/finishGate';
import type { LoopDecision } from '../diagnosis/loop/types';
import type { ReasonerRegionResult } from '../reasoning/types';
import type { LedgerEntry } from '../types/case';

// --- Held-out goal checks (LM-30) ---
// Every benchmark case carries hidden ground-truth checks the reasoner
// can't see. They live here — in the eval harness, keyed by case — never
// in the goal, never in the ledger, and never in the mechanic machine's
// input, so no reasoner run, prompt, or tool call can read them and game
// them. SpecBench's finding is the reason: visible checks saturate while
// held-out checks expose gaming, and the gap grows with task length.
//
// A held-out check reuses a visible criterion's check kinds
// (CriterionCheck), so it is judged by exactly the same proof rules:
// model evidence never proves, corrected evidence is retracted, a
// re-test must run after goal_set. A hidden check can therefore never
// pass where the same visible check would fail — it only asks for
// *different* evidence (a load re-test the goal never names, a
// drive-cycle rescan, a symptom check under load) that a shortcut run
// never produces.

/** One hidden ground-truth check for a benchmark case. */
export interface HeldOutCheck {
    id: string;
    description: string;
    check: CriterionCheck;
}

export interface HeldOutEvaluation {
    checks: CriterionEvaluation[];
    /** Every held-out check met. */
    allMet: boolean;
}

/**
 * Judges the held-out checks against a ledger. Held-out checks are
 * blocking by construction: a case is not honestly verified while any
 * hidden check is unmet. The `verify` phase is only a report label —
 * held-out checks gate no machine phase, because the machine never
 * sees them.
 */
export function evaluateHeldOutChecks(
    checks: ReadonlyArray<HeldOutCheck>,
    ledger: ReadonlyArray<LedgerEntry>,
    goalId?: string,
): HeldOutEvaluation {
    const criteria: Criterion[] = checks.map((heldOut) => ({
        id: heldOut.id,
        phase: 'verify',
        description: heldOut.description,
        check: heldOut.check,
        blocking: true,
    }));
    const evaluated = evaluateCriteria(criteria, ledger, goalId);
    return { checks: evaluated, allMet: evaluated.every((criterion) => criterion.verdict === 'met') };
}

export interface GoalLevelVerdict {
    caseId: string;
    goalId: string | undefined;
    /** What the visible path claims: the machine's terminal status. */
    claimedStatus: TerminalGoalStatus;
    claimedReason: string;
    /** Every visible goal criterion met. */
    visibleAllMet: boolean;
    /** Every blocking visible criterion met. */
    visibleBlockingMet: boolean;
    heldOutAllMet: boolean;
    heldOut: CriterionEvaluation[];
    /**
     * The run claims a verified fix the hidden checks do not support:
     * the visible criteria were satisfied — by gaming or by luck — while
     * the ground truth the reasoner never saw says the fault is not
     * proven fixed. This is the LM-30 false verified_fix.
     */
    falseVerifiedFix: boolean;
}

export interface GoalLevelInput {
    goal?: CaseGoal;
    heldOutChecks: ReadonlyArray<HeldOutCheck>;
    ledger: ReadonlyArray<LedgerEntry>;
    budgetUsage?: BudgetUsage;
    safetyStop?: { reason: string; hazard?: string };
    abstain?: AbstainHandoff;
    loopDecision?: LoopDecision | null;
    reasonerResult?: ReasonerRegionResult;
}

/**
 * The goal-level verdict for one benchmark case: the visible verdict
 * (what the machine claims, from LM-25/LM-26) against the hidden
 * verdict (what the ground truth says). A case is honestly verified
 * only when both agree; a claimed verified_fix with unmet held-out
 * checks is a false verified_fix, never a pass.
 */
export function evaluateGoalLevel(input: GoalLevelInput): GoalLevelVerdict {
    const { goal, heldOutChecks, ledger } = input;
    const visible = goal !== undefined ? evaluateGoal(goal, ledger) : undefined;
    const heldOut = evaluateHeldOutChecks(heldOutChecks, ledger, goal?.goalId);
    const terminal = resolveTerminalStatus({
        ...(goal !== undefined ? { goal } : {}),
        ledger,
        budgetUsage: input.budgetUsage ?? { ...EMPTY_BUDGET_USAGE },
        ...(input.safetyStop !== undefined ? { safetyStop: input.safetyStop } : {}),
        ...(input.abstain !== undefined ? { abstain: input.abstain } : {}),
        ...(input.loopDecision !== undefined ? { loopDecision: input.loopDecision } : {}),
        ...(input.reasonerResult !== undefined ? { reasonerResult: input.reasonerResult } : {}),
    });
    const claimedVerifiedFix = terminal.status === 'verified_fix';
    return {
        caseId: goal?.caseId ?? ledger[0]?.caseId ?? 'unknown',
        goalId: goal?.goalId,
        claimedStatus: terminal.status,
        claimedReason: terminal.reason,
        visibleAllMet: visible?.allMet ?? false,
        visibleBlockingMet: visible?.blockingMet ?? false,
        heldOutAllMet: heldOut.allMet,
        heldOut: heldOut.checks,
        falseVerifiedFix: claimedVerifiedFix && !heldOut.allMet,
    };
}
