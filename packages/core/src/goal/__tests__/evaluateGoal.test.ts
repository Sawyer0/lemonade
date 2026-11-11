import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import { amendGoal, buildGoal, evaluateGoal, transitionGoalStatus, type CriterionEvaluation } from '../evaluateGoal';
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

    it('treats moving to the current status as a no-op', () => {
        const goal = buildGoldenGoal();
        expect(transitionGoalStatus(goal, 'active', 'tech')).toBe(goal);
    });
});
