import { retractedEntryIds, type LedgerEntry } from '../types/case';
import { detectDrift, type DriftFlag, type ReasonerRunOutcome } from './drift';
import { NON_PROOF_ENTRY_KINDS, TERMINAL_GOAL_STATUSES, evaluateGoal, transitionGoalStatus } from './evaluateGoal';
import type { CaseGoal, EvidenceSource, GoalStatusChangedPayload } from './goalSchema';

// --- No-progress detection and repeated-blocker handoff (LM-28) ---
// A run is blocked when it drifts (see goal/drift.ts) or adds no admissible ledger entry. The same blocker
// three runs in a row moves the goal to `needs_tech` with one handoff naming the missing evidence. Pure and
// deterministic. The streak lives on the goal itself (`sameBlockerCount`,
// `lastBlocker`), next to the count LM-25 already reserved for it.

/** The same blocker this many runs in a row hands the case to the tech. */
export const DRIFT_REPEAT_THRESHOLD = 3;

/** One blocked run: the repeated key, and the evidence it is missing. */
export interface BlockerRecord {
    key: string;
    detail: string;
    missingEvidence: string[];
}

/** The single `needs_tech` handoff for a goal that kept hitting one blocker. */
export interface NeedsTechHandoff {
    goalId: string;
    caseId: string;
    blockerKey: string;
    detail: string;
    missingEvidence: string[];
    repeats: number;
    /** The `goal_status_changed` payload the caller appends to the ledger. */
    statusChange: GoalStatusChangedPayload;
}

export interface RunAssessment {
    runId: string;
    flags: DriftFlag[];
    madeProgress: boolean;
    blocked: boolean;
    blocker: BlockerRecord | undefined;
    goal: CaseGoal;
    handoff: NeedsTechHandoff | undefined;
}

/** Sources any criterion of the goal admits as proof (LM-25 vocabulary). */
function admissibleSourcesFor(goal: CaseGoal): ReadonlySet<EvidenceSource> {
    const sources = new Set<EvidenceSource>();
    for (const criterion of goal.criteria) {
        if (criterion.check.kind === 'ledger_has' || criterion.check.kind === 'pre_registered_test_passed') {
            for (const source of criterion.check.admissible) {
                sources.add(source);
            }
        }
    }
    return sources;
}

/**
 * A run made progress when it added at least one admissible ledger entry:
 * a non-audit, non-correction entry, from a non-model source, uncorrected,
 * whose source some criterion of the goal admits as proof (the LM-25 proof
 * rule, without requiring the entry to satisfy a criterion on its own). The
 * runner's model-sourced citation is therefore not progress: model output
 * never proves anything, so a run that only cites its own computation made
 * no progress toward the goal.
 */
export function runMadeProgress(goal: CaseGoal, ledger: ReadonlyArray<LedgerEntry>, run: ReasonerRunOutcome): boolean {
    const retracted = retractedEntryIds(ledger);
    const admissible = admissibleSourcesFor(goal);
    return run.appendedEntries.some(
        (entry) =>
            !NON_PROOF_ENTRY_KINDS.has(entry.type) &&
            entry.type !== 'correction' &&
            entry.source !== 'model' &&
            !retracted.has(entry.id) &&
            admissible.has(entry.source),
    );
}

/** The blocker for a run, or undefined when the run neither drifted nor stalled. */
export function blockerForRun(
    goal: CaseGoal,
    ledger: ReadonlyArray<LedgerEntry>,
    flags: ReadonlyArray<DriftFlag>,
    madeProgress: boolean,
): BlockerRecord | undefined {
    if (flags.length === 0 && madeProgress) {
        return undefined;
    }
    const parts = flags.map((flag) => `${flag.kind}:${flag.missingEvidence.join(',')}`).sort();
    if (!madeProgress) {
        parts.push('no_progress');
    }
    const missingEvidence: string[] = [];
    for (const flag of flags) {
        for (const evidence of flag.missingEvidence) {
            if (!missingEvidence.includes(evidence)) {
                missingEvidence.push(evidence);
            }
        }
    }
    if (!madeProgress) {
        // A stalled run names what the goal still needs: its unmet blocking
        // criteria, so the tech sees the missing evidence, not just the stall.
        const evaluation = evaluateGoal(goal, ledger);
        for (const criterion of evaluation.criteria) {
            if (criterion.blocking && criterion.verdict !== 'met') {
                const description = goal.criteria.find(
                    (candidate) => candidate.id === criterion.criterionId,
                )?.description;
                if (description !== undefined && !missingEvidence.includes(description)) {
                    missingEvidence.push(description);
                }
            }
        }
        if (missingEvidence.length === 0) {
            // Every blocking criterion is already met: what is missing is
            // any admissible entry at all, a run that moves the case forward.
            missingEvidence.push('an admissible ledger entry toward the goal');
        }
    }
    const detailParts = flags.map((flag) => flag.detail);
    if (!madeProgress) {
        detailParts.push('run added no admissible ledger entry');
    }
    return { key: parts.join('|'), detail: detailParts.join('; '), missingEvidence };
}

/**
 * Records one blocked run against the goal. A different blocker, or a run
 * that made progress, restarts the streak; the same blocker three runs in a
 * row moves the goal to `needs_tech` (code authority) and returns the one
 * handoff. A goal already at `needs_tech` or terminal never hands off twice.
 */
export function recordBlockedRun(
    goal: CaseGoal,
    blocker: BlockerRecord | undefined,
): { goal: CaseGoal; handoff: NeedsTechHandoff | undefined } {
    if (goal.status === 'needs_tech' || TERMINAL_GOAL_STATUSES.includes(goal.status)) {
        return { goal, handoff: undefined };
    }
    if (blocker === undefined) {
        if (goal.sameBlockerCount === 0 && goal.lastBlocker === undefined) {
            return { goal, handoff: undefined };
        }
        return { goal: { ...goal, sameBlockerCount: 0, lastBlocker: undefined }, handoff: undefined };
    }
    const repeats = blocker.key === goal.lastBlocker ? goal.sameBlockerCount + 1 : 1;
    if (repeats < DRIFT_REPEAT_THRESHOLD) {
        return { goal: { ...goal, sameBlockerCount: repeats, lastBlocker: blocker.key }, handoff: undefined };
    }
    const moved = transitionGoalStatus(goal, 'needs_tech', 'code');
    const reason = `Same blocker ${repeats} times: ${blocker.detail}. Missing evidence: ${blocker.missingEvidence.join('; ')}`;
    return {
        goal: { ...moved, sameBlockerCount: repeats, lastBlocker: blocker.key },
        handoff: {
            goalId: goal.goalId,
            caseId: goal.caseId,
            blockerKey: blocker.key,
            detail: blocker.detail,
            missingEvidence: [...blocker.missingEvidence],
            repeats,
            statusChange: {
                goalId: goal.goalId,
                from: goal.status,
                to: 'needs_tech',
                authority: 'code',
                reason,
            },
        },
    };
}

/**
 * One replay step: detects drift, judges progress, and records the blocker.
 * Replay a scripted reasoner's runs through this in order; the third
 * identical blocked run returns the `needs_tech` handoff.
 */
export function assessReasonerRun(
    goal: CaseGoal,
    ledger: ReadonlyArray<LedgerEntry>,
    run: ReasonerRunOutcome,
): RunAssessment {
    const flags = detectDrift(goal, ledger, run);
    const madeProgress = runMadeProgress(goal, ledger, run);
    const blocker = blockerForRun(goal, ledger, flags, madeProgress);
    const recorded = recordBlockedRun(goal, blocker);
    return {
        runId: run.runId,
        flags,
        madeProgress,
        blocked: blocker !== undefined,
        blocker,
        goal: recorded.goal,
        handoff: recorded.handoff,
    };
}
