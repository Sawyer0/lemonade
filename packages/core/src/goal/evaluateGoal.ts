import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/codes';
import { retractedEntryIds, type LedgerEntry } from '../types/case';
import {
    BudgetSchema,
    CaseGoalSchema,
    CriterionSchema,
    type Budget,
    type CaseGoal,
    type Criterion,
    type EvidenceSource,
    type GoalStatus,
    type JudgeCheck,
    type LedgerHasCheck,
    type PosteriorCheck,
    type PreRegisteredTestPassedCheck,
    type StatusAuthority,
} from './goalSchema';

// --- Goal evaluation (LM-25) ---
// evaluateGoal is pure and deterministic: same goal + same ledger (in any
// order) always returns the same verdicts. It reads only the ledger entries
// it is given, never the network, the clock, or a model.
//
// Proof rules, in one place:
// - A 'model'-sourced entry never satisfies a proof criterion, even if a
//   hand-built goal lists 'model' as admissible (the schema rejects that,
//   but the evaluator enforces it independently). Neither does a
//   'research'-sourced entry (LM-18): a background evidence sub-agent's
//   advisory summary is never proof, whatever the goal lists.
// - An entry retracted by a later `correction` is not evidence: the ledger's
//   own rule is that a mistake is fixed by appending a correction, so the
//   corrected entry no longer proves anything.
// - `goal_set`, `goal_amended`, `criterion_met`, and `goal_status_changed`
//   entries are audit records, not proof, and neither is a `correction`: a
//   criterion is met only by the underlying evidence, never because the
//   goal was set, amended, or earlier said to be met. Otherwise an
//   evaluation could certify itself.
// - A `judge` check is never met by this evaluator: the rubric needs a
//   semantic judge (LM-19), which the pure evaluator does not have. Goals
//   with judge criteria therefore stay unmet until LM-19 lands; that is
//   fail-closed, not a gap to work around.
// - A `posterior` check reads the ledger's `hypothesis` entries as the
//   posterior: each distinct hypothesis text is one hypothesis, its
//   confidence the highest confidence any entry gave it. This check measures
//   whether the reasoner's own beliefs are sharp enough, so it reads
//   hypothesis entries from any source (including the model) — it is a
//   belief check, not proof about the world.

export type CriterionVerdict = 'met' | 'unmet' | 'contradicted';

/** One ledger entry cited as evidence for a verdict. */
export interface LedgerReference {
    entryId: string;
    sequence: number;
    type: string;
}

export interface CriterionEvaluation {
    criterionId: string;
    phase: Criterion['phase'];
    verdict: CriterionVerdict;
    blocking: boolean;
    evidence: LedgerReference[];
    /** Why this verdict, in one line: the counts or the failing threshold. */
    reason: string;
}

export interface GoalEvaluation {
    goalId: string;
    goalVersion: number;
    caseId: string;
    /** Every criterion met, blocking or not. */
    allMet: boolean;
    /** Every blocking criterion met. */
    blockingMet: boolean;
    criteria: CriterionEvaluation[];
}

/** Terminal goal statuses: once reached, the goal cannot move or be amended. */
export const TERMINAL_GOAL_STATUSES: ReadonlyArray<GoalStatus> = [
    'verified_fix',
    'diagnosed_unverified',
    'abstained',
    'safety_stopped',
    'escalated',
];

function referenceOf(entry: LedgerEntry): LedgerReference {
    return { entryId: entry.id, sequence: entry.sequence, type: entry.type };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** JSON-value equality: primitives, arrays, and plain records. */
function deepEquals(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((item, index) => deepEquals(item, right[index] as unknown));
    }
    if (isPlainRecord(left) && isPlainRecord(right)) {
        const leftKeys = Object.keys(left);
        const rightKeys = Object.keys(right);
        return (
            leftKeys.length === rightKeys.length &&
            leftKeys.every(
                (key) => Object.prototype.hasOwnProperty.call(right, key) && deepEquals(left[key], right[key]),
            )
        );
    }
    return false;
}

/**
 * Partial payload match: every key in `where` must be present in the payload
 * with an equal value. Nested records match recursively, so
 * { result: 'pass' } matches a payload carrying more fields, and
 * { measured: { unit: 'psi' } } matches a payload with a larger `measured`
 * record. Arrays and scalars compare by value.
 */
function matchesWhere(payload: unknown, where: Record<string, unknown>): boolean {
    if (!isPlainRecord(payload)) {
        return false;
    }
    return Object.entries(where).every(([key, expected]) => {
        const actual = payload[key];
        if (isPlainRecord(expected) && isPlainRecord(actual)) {
            return matchesWhere(actual, expected);
        }
        return deepEquals(actual, expected);
    });
}

interface EvaluationContext {
    ordered: LedgerEntry[];
    correctedEntryIds: ReadonlySet<string>;
    /** Sequence of this goal's goal_set entry, when the ledger records it. */
    goalSetSequence: number | undefined;
}

/** An entry counts as proof only from an admissible, non-model, non-research source, uncorrected. */
function isProofEntry(entry: LedgerEntry, admissible: ReadonlyArray<EvidenceSource>, ctx: EvaluationContext): boolean {
    return (
        entry.source !== 'model' &&
        entry.source !== 'research' &&
        admissible.includes(entry.source) &&
        !ctx.correctedEntryIds.has(entry.id)
    );
}

/** Ledger kinds that are audit records, never proof: a `ledger_has` check must never match them. Exported for the LM-28 drift detector, which reuses the same proof rule for run progress. */
export const NON_PROOF_ENTRY_KINDS: ReadonlySet<string> = new Set([
    'goal_set',
    'goal_amended',
    'criterion_met',
    'goal_status_changed',
    'correction',
]);

function evaluateLedgerHas(criterion: Criterion, check: LedgerHasCheck, ctx: EvaluationContext): CriterionEvaluation {
    const where = check.where ?? {};
    const matching = ctx.ordered.filter(
        (entry) =>
            entry.type === check.entryKind &&
            !NON_PROOF_ENTRY_KINDS.has(entry.type) &&
            isProofEntry(entry, check.admissible, ctx) &&
            matchesWhere(entry.payload, where),
    );
    if (matching.length > 0) {
        return {
            criterionId: criterion.id,
            phase: criterion.phase,
            verdict: 'met',
            blocking: criterion.blocking,
            evidence: matching.map(referenceOf),
            reason: `${matching.length} matching ${check.entryKind} entr${matching.length === 1 ? 'y' : 'ies'} from admissible sources`,
        };
    }
    return {
        criterionId: criterion.id,
        phase: criterion.phase,
        verdict: 'unmet',
        blocking: criterion.blocking,
        evidence: [],
        reason: `no ${check.entryKind} entry from an admissible source matches`,
    };
}

function evaluatePosterior(criterion: Criterion, check: PosteriorCheck, ctx: EvaluationContext): CriterionEvaluation {
    // One hypothesis per distinct text; the confidence is the highest any
    // entry gave it. Corrected hypotheses are retracted and do not count.
    // The margin is over the runner-up; with a single distinct hypothesis
    // there is no runner-up, so the margin is the top confidence itself.
    const confidenceByHypothesis = new Map<string, number>();
    const hypothesisEntries: LedgerEntry[] = [];
    for (const entry of ctx.ordered) {
        if (entry.type !== 'hypothesis' || ctx.correctedEntryIds.has(entry.id)) {
            continue;
        }
        hypothesisEntries.push(entry);
        const previous = confidenceByHypothesis.get(entry.payload.text);
        if (previous === undefined || entry.payload.confidence > previous) {
            confidenceByHypothesis.set(entry.payload.text, entry.payload.confidence);
        }
    }
    const ranked = [...confidenceByHypothesis.values()].sort((a, b) => b - a);
    const top = ranked[0] ?? 0;
    const second = ranked[1] ?? 0;
    const margin = top - second;
    const base = {
        criterionId: criterion.id,
        phase: criterion.phase,
        blocking: criterion.blocking,
        // The verdict cites the hypotheses it was read from.
        evidence: hypothesisEntries.map(referenceOf),
    };
    if (ranked.length === 0) {
        return { ...base, verdict: 'unmet', reason: 'no hypothesis entries in the ledger' };
    }
    if (top >= check.minTop && margin >= check.minMargin) {
        return {
            ...base,
            verdict: 'met',
            reason: `top hypothesis ${top} with margin ${margin} meets minTop ${check.minTop} and minMargin ${check.minMargin}`,
        };
    }
    return {
        ...base,
        verdict: 'unmet',
        reason: `top hypothesis ${top} with margin ${margin} does not meet minTop ${check.minTop} and minMargin ${check.minMargin}`,
    };
}

function evaluatePreRegisteredTest(
    criterion: Criterion,
    check: PreRegisteredTestPassedCheck,
    ctx: EvaluationContext,
): CriterionEvaluation {
    // The re-test must run after the goal was set: a pass recorded before
    // commit is not the pre-registered re-test. When the ledger carries no
    // goal_set entry for this goal, the criterion is unmet: a goal that was
    // never set cannot be satisfied by a stale pass (fail closed).
    const base = {
        criterionId: criterion.id,
        phase: criterion.phase,
        blocking: criterion.blocking,
    };
    const goalSetSequence = ctx.goalSetSequence;
    if (goalSetSequence === undefined) {
        return {
            ...base,
            verdict: 'unmet',
            evidence: [],
            reason: 'no goal_set entry for this goal in the ledger',
        };
    }
    const runs = ctx.ordered.filter(
        (entry): entry is Extract<LedgerEntry, { type: 'test_result' }> =>
            entry.type === 'test_result' &&
            entry.payload.testName === check.testName &&
            isProofEntry(entry, check.admissible, ctx) &&
            entry.sequence > goalSetSequence,
    );
    const passes = runs.filter((entry) => entry.payload.result === 'pass');
    if (passes.length > 0) {
        return {
            ...base,
            verdict: 'met',
            evidence: passes.map(referenceOf),
            reason: `${check.testName} passed after the goal was set`,
        };
    }
    const failures = runs.filter((entry) => entry.payload.result === 'fail');
    if (failures.length > 0) {
        return {
            ...base,
            verdict: 'contradicted',
            evidence: failures.map(referenceOf),
            reason: `${check.testName} failed after the goal was set`,
        };
    }
    return {
        ...base,
        verdict: 'unmet',
        evidence: [],
        reason: `no passing ${check.testName} result after the goal was set`,
    };
}

function evaluateJudge(criterion: Criterion, _check: JudgeCheck): CriterionEvaluation {
    return {
        criterionId: criterion.id,
        phase: criterion.phase,
        verdict: 'unmet',
        blocking: criterion.blocking,
        evidence: [],
        reason: 'judge checks need the LM-19 semantic judge; the pure evaluator never marks them met',
    };
}

export function evaluateGoal(goal: CaseGoal, ledger: ReadonlyArray<LedgerEntry>): GoalEvaluation {
    const ordered = [...ledger].sort((a, b) => a.sequence - b.sequence);
    const correctedEntryIds = retractedEntryIds(ordered);
    const goalSetEntry = ordered.find((entry) => entry.type === 'goal_set' && entry.payload.goalId === goal.goalId);
    const ctx: EvaluationContext = {
        ordered,
        correctedEntryIds,
        goalSetSequence: goalSetEntry?.sequence,
    };
    const criteria = goal.criteria.map((criterion) => {
        switch (criterion.check.kind) {
            case 'ledger_has':
                return evaluateLedgerHas(criterion, criterion.check, ctx);
            case 'posterior':
                return evaluatePosterior(criterion, criterion.check, ctx);
            case 'pre_registered_test_passed':
                return evaluatePreRegisteredTest(criterion, criterion.check, ctx);
            case 'judge':
                return evaluateJudge(criterion, criterion.check);
        }
    });
    return {
        goalId: goal.goalId,
        goalVersion: goal.version,
        caseId: goal.caseId,
        allMet: criteria.every((criterion) => criterion.verdict === 'met'),
        blockingMet: criteria
            .filter((criterion) => criterion.blocking)
            .every((criterion) => criterion.verdict === 'met'),
        criteria,
    };
}

// --- Goal lifecycle ---
// Goals are built from a tech-confirmed complaint and a workflow template's
// criteria, never from model output: there is no model input anywhere here.

export interface BuildGoalInput {
    goalId: string;
    caseId: string;
    complaint: { text: string; symptoms: string[]; confirmedByTech: boolean };
    outcome: string;
    constraints: string[];
    /** Criteria from the workflow template for this complaint. */
    criteria: Array<z.input<typeof CriterionSchema>>;
    /** Budget as written by the template; schema defaults fill the rest. */
    budget: z.input<typeof BudgetSchema>;
}

/**
 * Parses a goal, surfacing schema failures as an INVALID_INPUT AppError
 * rather than a raw ZodError, like every other rejection in the goal path.
 */
function parseGoal(candidate: unknown): CaseGoal {
    try {
        return CaseGoalSchema.parse(candidate);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const detail = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
            throw new AppError(ErrorCode.INVALID_INPUT, `Invalid goal: ${detail}`);
        }
        throw error;
    }
}

/**
 * Builds version 1 of a goal. The complaint must be tech-confirmed: a goal
 * built from an unconfirmed complaint is rejected, not built unconfirmed.
 */
export function buildGoal(input: BuildGoalInput): CaseGoal {
    if (!input.complaint.confirmedByTech) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            'A case goal requires a tech-confirmed complaint; the model never sets a goal',
        );
    }
    return parseGoal({
        goalId: input.goalId,
        caseId: input.caseId,
        version: 1,
        complaint: {
            text: input.complaint.text,
            symptoms: input.complaint.symptoms,
            confirmedByTech: true as const,
        },
        outcome: input.outcome,
        constraints: input.constraints,
        criteria: input.criteria,
        budget: input.budget,
        status: 'active',
        statusAuthority: 'tech',
        sameBlockerCount: 0,
    });
}

export interface GoalAmendment {
    outcome?: string;
    constraints?: string[];
    criteria?: Criterion[];
    budget?: Budget;
    complaint?: { text: string; symptoms: string[] };
}

export interface AmendmentConfirmation {
    confirmedByTech: boolean;
    techId: string;
}

/**
 * Amends a goal: returns the next version with the changes applied. An
 * amendment without tech confirmation is rejected — the caller must have a
 * tech confirm it first. The goal id and case id can never change, and a
 * terminal goal cannot be amended.
 */
export function amendGoal(current: CaseGoal, changes: GoalAmendment, confirmation: AmendmentConfirmation): CaseGoal {
    if (!confirmation.confirmedByTech) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            'A goal amendment requires tech confirmation; an unconfirmed amendment is rejected',
        );
    }
    if (confirmation.techId.trim().length === 0) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            'A goal amendment requires the confirming tech id; an empty tech id is rejected',
        );
    }
    if (TERMINAL_GOAL_STATUSES.includes(current.status)) {
        throw new AppError(ErrorCode.INVALID_INPUT, `A goal in terminal status ${current.status} cannot be amended`);
    }
    if (
        changes.outcome === undefined &&
        changes.constraints === undefined &&
        changes.criteria === undefined &&
        changes.budget === undefined &&
        changes.complaint === undefined
    ) {
        throw new AppError(
            ErrorCode.INVALID_INPUT,
            'A goal amendment with no changes is rejected; an empty amendment must not consume a version',
        );
    }
    return parseGoal({
        ...current,
        ...(changes.outcome !== undefined ? { outcome: changes.outcome } : {}),
        ...(changes.constraints !== undefined ? { constraints: changes.constraints } : {}),
        ...(changes.criteria !== undefined ? { criteria: changes.criteria } : {}),
        ...(changes.budget !== undefined ? { budget: changes.budget } : {}),
        ...(changes.complaint !== undefined
            ? {
                  complaint: {
                      text: changes.complaint.text,
                      symptoms: changes.complaint.symptoms,
                      confirmedByTech: true as const,
                  },
              }
            : {}),
        version: current.version + 1,
        // LM-28: a new goal version restarts the blocker streak. The old
        // blocker was counted against the goal as it was; it must not carry
        // over and hand a rewritten goal to the tech.
        sameBlockerCount: 0,
        lastBlocker: undefined,
    });
}

/**
 * Moves a goal to a new status. Authority is enforced, and the model never
 * sets status directly:
 * - 'paused' is tech-only; 'budget_limited' is system-only.
 * - 'verified_fix', 'diagnosed_unverified', 'abstained', 'safety_stopped'
 *   and 'escalated' are code-only: only the evaluator or safety code may
 *   derive them, never a person or the model.
 * - 'active' and 'needs_tech' accept any authority: code, tech, or system
 *   (the harness may resume a goal, e.g. after a budget hold clears).
 * Terminal statuses never transition out. Moving to the current status is a
 * no-op and returns the goal unchanged, but the authority is still checked,
 * so an unauthorized actor cannot restate a status either.
 */
export function transitionGoalStatus(goal: CaseGoal, next: GoalStatus, authority: StatusAuthority): CaseGoal {
    assertTransitionAuthority(next, authority);
    if (next === goal.status) {
        return goal;
    }
    if (TERMINAL_GOAL_STATUSES.includes(goal.status)) {
        throw new AppError(ErrorCode.INVALID_INPUT, `A goal in terminal status ${goal.status} cannot move to ${next}`);
    }
    return { ...goal, status: next, statusAuthority: authority };
}

/** Throws unless `authority` may set a goal to `next`. */
function assertTransitionAuthority(next: GoalStatus, authority: StatusAuthority): void {
    const codeOnly: ReadonlyArray<GoalStatus> = [
        'verified_fix',
        'diagnosed_unverified',
        'abstained',
        'safety_stopped',
        'escalated',
    ];
    if (next === 'paused' && authority !== 'tech') {
        throw new AppError(ErrorCode.INVALID_INPUT, 'Only the tech can pause a goal');
    }
    if (next === 'budget_limited' && authority !== 'system') {
        throw new AppError(ErrorCode.INVALID_INPUT, 'Only the system can mark a goal budget-limited');
    }
    if (codeOnly.includes(next) && authority !== 'code') {
        throw new AppError(ErrorCode.INVALID_INPUT, `Only the evaluator or safety code can set a goal to ${next}`);
    }
}
