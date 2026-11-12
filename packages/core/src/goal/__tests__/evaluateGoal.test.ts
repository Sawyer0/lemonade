import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import type { LedgerEntry } from '../../types/case';
import { amendGoal, buildGoal, evaluateGoal, transitionGoalStatus, unmetDeterministicBlockers, type CriterionEvaluation } from '../evaluateGoal';
import type { CaseGoal } from '../goalSchema';
import {
    buildGoldenCase,
    buildGoldenGoal,
    appendGoldenLedgerEntry,
    GOLDEN_CASE_ID,
    GOLDEN_GOAL_ID,
} from './fixtures/goldenCase';

function verdictOf(evaluation: { criteria: CriterionEvaluation[] }, criterionId: string): string {
    const found = evaluation.criteria.find((criterion) => criterion.criterionId === criterionId);
    if (found === undefined) {
        throw new Error(`criterion ${criterionId} missing from evaluation`);
    }
    return found.verdict;
}

/** Appends one audit entry of the given kind, with a payload that would match a bare `ledger_has` check. */
function appendAuditEntry(entries: LedgerEntry[], kind: LedgerEntry['type'], goal: CaseGoal): LedgerEntry {
    switch (kind) {
        case 'goal_set':
            return appendGoldenLedgerEntry(entries, 'goal_set', { goalId: GOLDEN_GOAL_ID, goal });
        case 'goal_amended':
            return appendGoldenLedgerEntry(entries, 'goal_amended', {
                goalId: GOLDEN_GOAL_ID,
                previousVersion: 1,
                version: 2,
                amendedByTechId: 'tech-123',
                note: 'Symptom list corrected',
            });
        case 'criterion_met':
            return appendGoldenLedgerEntry(entries, 'criterion_met', {
                goalId: GOLDEN_GOAL_ID,
                criterionId: 'verify.audit_not_proof',
                entryId: '33333333-3333-4333-8333-333333333333',
                entrySequence: 8,
            });
        case 'goal_status_changed':
            return appendGoldenLedgerEntry(entries, 'goal_status_changed', {
                goalId: GOLDEN_GOAL_ID,
                from: 'active',
                to: 'paused',
                authority: 'tech',
            });
        case 'correction':
            return appendGoldenLedgerEntry(
                entries,
                'correction',
                { text: 'Earlier entry was a mistake' },
                { correctsEntryId: entries[0].id },
            );
        default:
            throw new Error(`not an audit kind: ${kind}`);
    }
}

describe('evaluateGoal on the golden case', () => {
    it('evaluates to all-met only with the full ledger, re-test included', () => {
        const { goal, entries } = buildGoldenCase();
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(true);
        expect(evaluation.blockingMet).toBe(true);
        expect(evaluation.goalId).toBe(GOLDEN_GOAL_ID);
        expect(evaluation.goalVersion).toBe(1);
        expect(evaluation.caseId).toBe(GOLDEN_CASE_ID);
        for (const criterion of evaluation.criteria) {
            expect(criterion.verdict).toBe('met');
            expect(criterion.evidence.length).toBeGreaterThan(0);
        }
    });

    it('is deterministic regardless of ledger order', () => {
        const { goal, entries } = buildGoldenCase();
        const forward = evaluateGoal(goal, entries);
        const backward = evaluateGoal(goal, [...entries].reverse());
        expect(backward).toEqual(forward);
    });

    it('is unmet without the pre-registered re-test', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'absent' });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
        expect(verdictOf(evaluation, 'differentiate.top_hypothesis')).toBe('met');
        expect(verdictOf(evaluation, 'verify.symptom_absent')).toBe('met');
    });

    it('is unmet when the only re-test ran before the goal was set', () => {
        const { goal, entries } = buildGoldenCase({ retestBeforeGoal: true });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('never lets a model-sourced re-test satisfy the proof criterion', () => {
        const { goal, entries } = buildGoldenCase({ retestSource: 'model' });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('never lets a research-sourced advisory satisfy the proof criterion (LM-18)', () => {
        const { goal, entries } = buildGoldenCase({ retestSource: 'research' });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('marks the re-test contradicted when it fails after the goal was set', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'fail' });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('contradicted');
        const retest = evaluation.criteria.find((criterion) => criterion.criterionId === 'verify.retest');
        expect(retest?.evidence).toHaveLength(1);
        expect(retest?.evidence[0].type).toBe('test_result');
    });

    it('is unmet when the re-test entry is corrected away', () => {
        const { goal, entries } = buildGoldenCase({ correctRetest: true });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('is unmet when the symptom observation is missing', () => {
        const { goal, entries } = buildGoldenCase({ symptomAbsent: false });
        const evaluation = evaluateGoal(goal, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.symptom_absent')).toBe('unmet');
    });

    it('reads the posterior from hypothesis confidences, not from one entry', () => {
        // Top 0.55 with margin 0.05: below minTop 0.7 and minMargin 0.2.
        const { goal, entries } = buildGoldenCase({ hypothesisConfidences: [0.55, 0.5, 0.55] });
        const evaluation = evaluateGoal(goal, entries);
        expect(verdictOf(evaluation, 'differentiate.top_hypothesis')).toBe('unmet');
    });

    it('does not let a criterion_met entry certify itself', () => {
        const { goal, entries } = buildGoldenCase({ retestResult: 'absent' });
        const claimed = appendGoldenLedgerEntry(entries, 'criterion_met', {
            goalId: GOLDEN_GOAL_ID,
            criterionId: 'verify.retest',
            entryId: '33333333-3333-4333-8333-333333333333',
            entrySequence: 8,
        });
        const evaluation = evaluateGoal(goal, [...entries, claimed]);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('never lets an audit entry satisfy a ledger_has criterion', () => {
        const auditKinds: LedgerEntry['type'][] = [
            'goal_set',
            'goal_amended',
            'criterion_met',
            'goal_status_changed',
            'correction',
        ];
        for (const kind of auditKinds) {
            const goal: CaseGoal = {
                ...buildGoldenGoal(),
                criteria: [
                    {
                        id: 'verify.audit_not_proof',
                        phase: 'verify',
                        description: 'An audit entry must never count as proof',
                        blocking: true,
                        check: { kind: 'ledger_has', entryKind: kind, admissible: ['tech'] },
                    },
                ],
            };
            const { entries } = buildGoldenCase({ retestResult: 'absent' });
            const audit = appendAuditEntry(entries, kind, goal);
            const evaluation = evaluateGoal(goal, [...entries, audit]);
            expect(verdictOf(evaluation, 'verify.audit_not_proof')).toBe('unmet');
        }
    });

    it('is unmet for the re-test when the ledger carries no goal_set entry', () => {
        const { goal, entries } = buildGoldenCase();
        const withoutGoalSet = entries.filter((entry) => entry.type !== 'goal_set');
        const evaluation = evaluateGoal(goal, withoutGoalSet);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.retest')).toBe('unmet');
    });

    it('never marks a judge check met: semantic leftovers need LM-19', () => {
        const goal = buildGoldenGoal();
        const judged = {
            ...goal,
            criteria: [
                {
                    id: 'verify.root_cause_explained',
                    phase: 'verify' as const,
                    description: 'The repair explanation addresses the root cause',
                    blocking: true,
                    check: { kind: 'judge' as const, rubric: 'The repair addresses the root cause' },
                },
            ],
        };
        const { entries } = buildGoldenCase();
        const evaluation = evaluateGoal(judged, entries);
        expect(evaluation.allMet).toBe(false);
        expect(verdictOf(evaluation, 'verify.root_cause_explained')).toBe('unmet');
    });

    describe('unmetDeterministicBlockers (LM-27)', () => {
        it('lists the unmet blocking deterministic criteria, with a criterion-level reason each', () => {
            const { goal, entries } = buildGoldenCase({ retestResult: 'absent', symptomAbsent: false });
            const blockers = unmetDeterministicBlockers(goal, evaluateGoal(goal, entries));
            expect(blockers.map((blocker) => blocker.criterionId)).toEqual([
                'verify.retest',
                'verify.symptom_absent',
            ]);
            expect(blockers[0].reason).toContain('compression-cylinder-1');
            expect(blockers[1].reason).toContain('observation');
        });

        it('is empty when every blocking deterministic criterion is met', () => {
            const { goal, entries } = buildGoldenCase();
            expect(unmetDeterministicBlockers(goal, evaluateGoal(goal, entries))).toEqual([]);
        });

        it('never lists a judge criterion, even though the pure evaluator marks it unmet', () => {
            const goal = buildGoldenGoal();
            const judged = {
                ...goal,
                criteria: [
                    ...goal.criteria,
                    {
                        id: 'verify.root_cause_explained',
                        phase: 'verify' as const,
                        description: 'The repair explanation addresses the root cause',
                        blocking: true,
                        check: { kind: 'judge' as const, rubric: 'The repair addresses the root cause' },
                    },
                ],
            };
            const { entries } = buildGoldenCase();
            const blockers = unmetDeterministicBlockers(judged, evaluateGoal(judged, entries));
            expect(blockers.map((blocker) => blocker.criterionId)).not.toContain('verify.root_cause_explained');
        });

        it('never lists a non-blocking criterion, even when it is unmet', () => {
            const goal = buildGoldenGoal();
            const withNonBlocking = {
                ...goal,
                criteria: [
                    ...goal.criteria,
                    {
                        id: 'verify.notes_filed',
                        phase: 'verify' as const,
                        description: 'Repair notes filed for the record',
                        blocking: false,
                        check: {
                            kind: 'ledger_has' as const,
                            entryKind: 'observation',
                            where: { text: 'Notes filed' },
                            admissible: ['tech'],
                        },
                    },
                ],
            };
            const { entries } = buildGoldenCase({ retestResult: 'absent' });
            const blockers = unmetDeterministicBlockers(withNonBlocking, evaluateGoal(withNonBlocking, entries));
            expect(blockers.map((blocker) => blocker.criterionId)).toEqual(['verify.retest']);
        });

        it('lists a contradicted criterion: a failed re-test blocks like a missing one', () => {
            const { goal, entries } = buildGoldenCase({ retestResult: 'fail' });
            const blockers = unmetDeterministicBlockers(goal, evaluateGoal(goal, entries));
            expect(blockers.map((blocker) => blocker.criterionId)).toEqual(['verify.retest']);
            expect(blockers[0].verdict).toBe('contradicted');
        });
    });

    it('reports blockingMet from blocking criteria only', () => {
        const goal = buildGoldenGoal();
        const nonBlocking = {
            ...goal,
            criteria: [
                ...goal.criteria,
                {
                    id: 'verify.notes_filed',
                    phase: 'verify' as const,
                    description: 'Repair notes filed for the record',
                    blocking: false,
                    check: {
                        kind: 'ledger_has' as const,
                        entryKind: 'observation',
                        where: { text: 'Notes filed' },
                        admissible: ['tech'],
                    },
                },
            ],
        };
        const { entries } = buildGoldenCase();
        const evaluation = evaluateGoal(nonBlocking, entries);
        expect(evaluation.allMet).toBe(false);
        expect(evaluation.blockingMet).toBe(true);
        expect(verdictOf(evaluation, 'verify.notes_filed')).toBe('unmet');
    });
});

describe('buildGoal', () => {
    it('builds version 1 of a goal from a tech-confirmed complaint', () => {
        const goal = buildGoldenGoal();
        expect(goal.version).toBe(1);
        expect(goal.status).toBe('active');
        expect(goal.statusAuthority).toBe('tech');
        expect(goal.complaint.confirmedByTech).toBe(true);
    });

    it('rejects a goal from an unconfirmed complaint', () => {
        const input = {
            goalId: GOLDEN_GOAL_ID,
            caseId: GOLDEN_CASE_ID,
            complaint: { text: 'Misfire', symptoms: ['misfire'], confirmedByTech: false },
            outcome: 'Fixed',
            constraints: [],
            criteria: [
                {
                    id: 'verify.retest',
                    phase: 'verify' as const,
                    description: 'Re-test passes',
                    check: { kind: 'posterior' as const, minTop: 0.7, minMargin: 0.2 },
                    blocking: true,
                },
            ],
            budget: { maxTokens: 1000, maxWallMinutes: 10, maxTestCostMinutes: 5 },
        };
        try {
            buildGoal(input);
            expect.unreachable('buildGoal must reject an unconfirmed complaint');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });

    it('rejects a malformed goal id as INVALID_INPUT, not a raw ZodError', () => {
        const input = {
            goalId: 'not-a-uuid',
            caseId: GOLDEN_CASE_ID,
            complaint: { text: 'Misfire', symptoms: ['misfire'], confirmedByTech: true },
            outcome: 'Fixed',
            constraints: [],
            criteria: [
                {
                    id: 'verify.retest',
                    phase: 'verify' as const,
                    description: 'Re-test passes',
                    check: { kind: 'posterior' as const, minTop: 0.7, minMargin: 0.2 },
                    blocking: true,
                },
            ],
            budget: { maxTokens: 1000, maxWallMinutes: 10, maxTestCostMinutes: 5 },
        };
        try {
            buildGoal(input);
            expect.unreachable('buildGoal must reject a malformed goal id');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });
});

describe('amendGoal', () => {
    const confirmation = { confirmedByTech: true, techId: 'tech-123' };

    it('bumps the version by one on a tech-confirmed amendment', () => {
        const amended = amendGoal(
            buildGoldenGoal(),
            { outcome: 'Root cause confirmed, gasket replaced' },
            confirmation,
        );
        expect(amended.version).toBe(2);
        expect(amended.outcome).toBe('Root cause confirmed, gasket replaced');
        expect(amended.goalId).toBe(GOLDEN_GOAL_ID);
        expect(amended.caseId).toBe(GOLDEN_CASE_ID);
        expect(amended.complaint.confirmedByTech).toBe(true);
    });

    it('rejects an amendment without tech confirmation', () => {
        try {
            amendGoal(
                buildGoldenGoal(),
                { outcome: 'Changed without the tech' },
                { confirmedByTech: false, techId: '' },
            );
            expect.unreachable('amendGoal must reject an unconfirmed amendment');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });

    it('rejects amending a terminal goal', () => {
        const terminal = { ...buildGoldenGoal(), status: 'verified_fix' as const, statusAuthority: 'code' as const };
        expect(() => amendGoal(terminal, { outcome: 'Too late' }, confirmation)).toThrowError(AppError);
    });

    it('rejects an amendment with no changes', () => {
        try {
            amendGoal(buildGoldenGoal(), {}, confirmation);
            expect.unreachable('amendGoal must reject an amendment with no changes');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });

    it('rejects an amendment confirmed by a tech with an empty tech id', () => {
        try {
            amendGoal(buildGoldenGoal(), { outcome: 'Changed' }, { confirmedByTech: true, techId: '' });
            expect.unreachable('amendGoal must reject an empty confirming tech id');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });

    it('rejects malformed criteria as INVALID_INPUT, not a raw ZodError', () => {
        const goal = buildGoldenGoal();
        try {
            amendGoal(goal, { criteria: [{ ...goal.criteria[0], description: 'x'.repeat(281) }] }, confirmation);
            expect.unreachable('amendGoal must reject malformed criteria');
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.INVALID_INPUT);
        }
    });
});

describe('transitionGoalStatus', () => {
    it('lets the tech pause and resume a goal', () => {
        const goal = buildGoldenGoal();
        const paused = transitionGoalStatus(goal, 'paused', 'tech');
        expect(paused.status).toBe('paused');
        expect(paused.statusAuthority).toBe('tech');
        expect(paused.version).toBe(goal.version);
        const resumed = transitionGoalStatus(paused, 'active', 'tech');
        expect(resumed.status).toBe('active');
    });

    it('lets only the system mark a goal budget-limited', () => {
        const goal = buildGoldenGoal();
        expect(() => transitionGoalStatus(goal, 'budget_limited', 'tech')).toThrowError(AppError);
        expect(transitionGoalStatus(goal, 'budget_limited', 'system').status).toBe('budget_limited');
    });

    it('lets only code set a verified fix', () => {
        const goal = buildGoldenGoal();
        expect(() => transitionGoalStatus(goal, 'verified_fix', 'tech')).toThrowError(AppError);
        expect(transitionGoalStatus(goal, 'verified_fix', 'code').status).toBe('verified_fix');
    });

    it('never lets a terminal goal move again', () => {
        const goal = transitionGoalStatus(buildGoldenGoal(), 'abstained', 'code');
        expect(() => transitionGoalStatus(goal, 'active', 'tech')).toThrowError(AppError);
    });

    it('lets the system move a goal to needs_tech', () => {
        const goal = buildGoldenGoal();
        const moved = transitionGoalStatus(goal, 'needs_tech', 'system');
        expect(moved.status).toBe('needs_tech');
        expect(moved.statusAuthority).toBe('system');
    });

    it('still checks authority on a no-op move', () => {
        const paused = transitionGoalStatus(buildGoldenGoal(), 'paused', 'tech');
        expect(() => transitionGoalStatus(paused, 'paused', 'system')).toThrowError(AppError);
        expect(transitionGoalStatus(paused, 'paused', 'tech')).toBe(paused);
    });

    it('treats moving to the current status as a no-op', () => {
        const goal = buildGoldenGoal();
        expect(transitionGoalStatus(goal, 'active', 'tech')).toBe(goal);
    });
});
