import { describe, it, expect } from 'vitest';
import {
    AdmissibleSourcesSchema,
    BudgetSchema,
    CaseGoalSchema,
    CriterionMetPayloadSchema,
    CriterionSchema,
    EvidenceSourceSchema,
    GoalAmendedPayloadSchema,
    GoalSetPayloadSchema,
    GoalStatusChangedPayloadSchema,
} from '../goalSchema';
import { LedgerSourceSchema } from '../../types/case';
import { buildGoldenGoal, GOLDEN_GOAL_ID } from './fixtures/goldenCase';

describe('EvidenceSourceSchema', () => {
    it('lists exactly the ledger sources, so goals and ledger entries share one vocabulary', () => {
        expect([...EvidenceSourceSchema.options].sort()).toEqual([...LedgerSourceSchema.options].sort());
    });
});

describe('AdmissibleSourcesSchema', () => {
    it('accepts a nonempty list of non-model sources', () => {
        expect(AdmissibleSourcesSchema.safeParse(['tech', 'sandbox']).success).toBe(true);
    });

    it('rejects an empty list', () => {
        expect(AdmissibleSourcesSchema.safeParse([]).success).toBe(false);
    });

    it('rejects model evidence as proof', () => {
        expect(AdmissibleSourcesSchema.safeParse(['tech', 'model']).success).toBe(false);
        expect(AdmissibleSourcesSchema.safeParse(['model']).success).toBe(false);
    });
});

describe('CriterionSchema', () => {
    it('parses each check kind', () => {
        const base = { id: 'verify.retest', phase: 'verify', description: 'Re-test passes' };
        const checks = [
            { kind: 'ledger_has', entryKind: 'test_result', where: { result: 'pass' }, admissible: ['tech'] },
            { kind: 'posterior', minTop: 0.7, minMargin: 0.2 },
            {
                kind: 'pre_registered_test_passed',
                testName: 'compression-cylinder-1',
                admissible: ['tech', 'sandbox'],
            },
            { kind: 'judge', rubric: 'The repair addresses the root cause' },
        ];
        for (const check of checks) {
            expect(CriterionSchema.safeParse({ ...base, check }).success).toBe(true);
        }
    });

    it('defaults blocking to true', () => {
        const result = CriterionSchema.safeParse({
            id: 'verify.retest',
            phase: 'verify',
            description: 'Re-test passes',
            check: { kind: 'posterior', minTop: 0.7, minMargin: 0.2 },
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.blocking).toBe(true);
        }
    });

    it('rejects a description over 280 characters', () => {
        const result = CriterionSchema.safeParse({
            id: 'verify.retest',
            phase: 'verify',
            description: 'x'.repeat(281),
            check: { kind: 'posterior', minTop: 0.7, minMargin: 0.2 },
        });
        expect(result.success).toBe(false);
    });

    it('rejects a posterior threshold outside 0-1', () => {
        const result = CriterionSchema.safeParse({
            id: 'verify.retest',
            phase: 'verify',
            description: 'Re-test passes',
            check: { kind: 'posterior', minTop: 1.4, minMargin: 0.2 },
        });
        expect(result.success).toBe(false);
    });
});

describe('BudgetSchema', () => {
    it('defaults maxReasonerRuns to 8 and maxTechAsks to 6', () => {
        const result = BudgetSchema.safeParse({ maxTokens: 200000, maxWallMinutes: 60, maxTestCostMinutes: 30 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.maxReasonerRuns).toBe(8);
            expect(result.data.maxTechAsks).toBe(6);
        }
    });

    it('rejects a non-positive token budget', () => {
        const result = BudgetSchema.safeParse({ maxTokens: 0, maxWallMinutes: 60, maxTestCostMinutes: 30 });
        expect(result.success).toBe(false);
    });
});

describe('CaseGoalSchema', () => {
    it('parses the golden goal', () => {
        expect(CaseGoalSchema.safeParse(buildGoldenGoal()).success).toBe(true);
    });

    it('rejects a complaint the tech never confirmed', () => {
        const goal = buildGoldenGoal();
        const result = CaseGoalSchema.safeParse({
            ...goal,
            complaint: { text: goal.complaint.text, symptoms: goal.complaint.symptoms, confirmedByTech: false },
        });
        expect(result.success).toBe(false);
    });

    it('rejects an empty criteria list and empty symptoms', () => {
        const goal = buildGoldenGoal();
        expect(CaseGoalSchema.safeParse({ ...goal, criteria: [] }).success).toBe(false);
        expect(
            CaseGoalSchema.safeParse({ ...goal, complaint: { ...goal.complaint, symptoms: [] } }).success,
        ).toBe(false);
    });

    it('rejects a version below 1', () => {
        expect(CaseGoalSchema.safeParse({ ...buildGoldenGoal(), version: 0 }).success).toBe(false);
    });

    it('rejects an outcome over 500 characters', () => {
        expect(CaseGoalSchema.safeParse({ ...buildGoldenGoal(), outcome: 'x'.repeat(501) }).success).toBe(false);
    });
});

describe('goal ledger payloads', () => {
    it('parses a goal_set payload carrying the full goal', () => {
        const goal = buildGoldenGoal();
        expect(GoalSetPayloadSchema.safeParse({ goalId: GOLDEN_GOAL_ID, goal }).success).toBe(true);
    });

    it('parses a goal_amended payload with the version step', () => {
        const result = GoalAmendedPayloadSchema.safeParse({
            goalId: GOLDEN_GOAL_ID,
            previousVersion: 1,
            version: 2,
            amendedByTechId: 'tech-123',
            note: 'Symptom list corrected: rough idle, not stalling',
        });
        expect(result.success).toBe(true);
    });

    it('parses a criterion_met payload pointing at the satisfying entry', () => {
        const result = CriterionMetPayloadSchema.safeParse({
            goalId: GOLDEN_GOAL_ID,
            criterionId: 'verify.retest',
            entryId: '33333333-3333-4333-8333-333333333333',
            entrySequence: 8,
        });
        expect(result.success).toBe(true);
    });

    it('parses a goal_status_changed payload', () => {
        const result = GoalStatusChangedPayloadSchema.safeParse({
            goalId: GOLDEN_GOAL_ID,
            from: 'active',
            to: 'verified_fix',
            authority: 'code',
            reason: 'all criteria met',
        });
        expect(result.success).toBe(true);
    });

    it('rejects a goal_status_changed payload with an unknown status', () => {
        const result = GoalStatusChangedPayloadSchema.safeParse({
            goalId: GOLDEN_GOAL_ID,
            from: 'active',
            to: 'done',
            authority: 'code',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a goal_set payload whose goalId disagrees with the embedded goal', () => {
        const goal = buildGoldenGoal();
        expect(
            GoalSetPayloadSchema.safeParse({ goalId: '44444444-4444-4444-8444-444444444444', goal }).success,
        ).toBe(false);
    });
});
