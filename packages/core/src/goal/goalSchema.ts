import { z } from 'zod';

// --- Case goals (LM-25) ---
// A goal is the machine-checkable definition of done for one case: the
// tech-confirmed complaint, the outcome the case must reach, the criteria
// that prove it, and the budget the run may spend. Goals come from a
// tech-confirmed complaint and a workflow template, never from the model —
// the complaint schema below only parses when confirmedByTech is true, and
// buildGoal (evaluateGoal.ts) throws on anything else.
//
// Evidence sources mirror the ledger's source vocabulary
// (LedgerSourceSchema in types/case.ts) so the evaluator can compare a
// goal's admissible list directly against a ledger entry's source. Keep the
// two enums in step: goalSchema.test.ts asserts they list the same values.
// 'sandbox' is a test run in the sandbox, not a model opinion; 'model' is a
// source an entry can carry, but it is never admissible as proof.
export const EvidenceSourceSchema = z.enum(['tech', 'glasses', 'OBD', 'sandbox', 'NHTSA', 'model']);
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

// Admissible sources for one proof criterion: nonempty, and 'model' is
// rejected at the schema level as well as by the evaluator, so a goal that
// lists model evidence as proof cannot even be constructed.
export const AdmissibleSourcesSchema = z
    .array(EvidenceSourceSchema)
    .nonempty()
    .refine((sources) => !sources.includes('model'), {
        message: 'model evidence is never admissible as proof',
    });
export type AdmissibleSources = z.infer<typeof AdmissibleSourcesSchema>;

export const GoalPhaseSchema = z.enum(['intake', 'differentiate', 'test', 'commit', 'repair', 'verify']);
export type GoalPhase = z.infer<typeof GoalPhaseSchema>;

export const LedgerHasCheckSchema = z.object({
    kind: z.literal('ledger_has'),
    // Ledger event type the evidence must be, e.g. 'test_result'.
    entryKind: z.string().min(1),
    // Partial payload match: every key must equal the entry's payload value
    // (nested objects match recursively). Absent means any entry of the kind
    // from an admissible source counts.
    where: z.record(z.unknown()).optional(),
    admissible: AdmissibleSourcesSchema,
});
export type LedgerHasCheck = z.infer<typeof LedgerHasCheckSchema>;

export const PosteriorCheckSchema = z.object({
    kind: z.literal('posterior'),
    minTop: z.number().min(0).max(1),
    minMargin: z.number().min(0).max(1),
});
export type PosteriorCheck = z.infer<typeof PosteriorCheckSchema>;

export const PreRegisteredTestPassedCheckSchema = z.object({
    kind: z.literal('pre_registered_test_passed'),
    // The test fixed at commit time: only a test_result with this testName,
    // recorded after the goal_set entry, can satisfy the criterion.
    testName: z.string().min(1),
    admissible: AdmissibleSourcesSchema,
});
export type PreRegisteredTestPassedCheck = z.infer<typeof PreRegisteredTestPassedCheckSchema>;

export const JudgeCheckSchema = z.object({
    kind: z.literal('judge'),
    // Semantic leftovers only (LM-19). The pure evaluator never marks a
    // judge check met: it has no model to run the rubric.
    rubric: z.string().min(1),
});
export type JudgeCheck = z.infer<typeof JudgeCheckSchema>;

export const CriterionCheckSchema = z.discriminatedUnion('kind', [
    LedgerHasCheckSchema,
    PosteriorCheckSchema,
    PreRegisteredTestPassedCheckSchema,
    JudgeCheckSchema,
]);
export type CriterionCheck = z.infer<typeof CriterionCheckSchema>;

export const CriterionSchema = z.object({
    id: z.string().min(1),
    phase: GoalPhaseSchema,
    description: z.string().max(280),
    check: CriterionCheckSchema,
    blocking: z.boolean().default(true),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const BudgetSchema = z.object({
    maxReasonerRuns: z.number().int().positive().default(8),
    maxTokens: z.number().int().positive(),
    maxWallMinutes: z.number().int().positive(),
    maxTechAsks: z.number().int().nonnegative().default(6),
    maxTestCostMinutes: z.number().int().positive(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const GoalStatusSchema = z.enum([
    'active',
    'needs_tech',
    'paused',
    'budget_limited',
    'verified_fix',
    'diagnosed_unverified',
    'abstained',
    'safety_stopped',
    'escalated',
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

// Who set the status. The model never sets status directly: 'code' is the
// evaluator/safety code, 'tech' is the technician, 'system' is the harness.
export const StatusAuthoritySchema = z.enum(['code', 'tech', 'system']);
export type StatusAuthority = z.infer<typeof StatusAuthoritySchema>;

export const CaseGoalSchema = z.object({
    goalId: z.string().uuid(),
    caseId: z.string().uuid(),
    // Bumps by one on every tech-confirmed goal_amended, and only then.
    version: z.number().int().positive(),
    complaint: z.object({
        text: z.string().min(1),
        symptoms: z.array(z.string().min(1)).nonempty(),
        confirmedByTech: z.literal(true),
    }),
    outcome: z.string().max(500),
    constraints: z.array(z.string().min(1)),
    criteria: z.array(CriterionSchema).nonempty(),
    budget: BudgetSchema,
    status: GoalStatusSchema,
    statusAuthority: StatusAuthoritySchema,
    sameBlockerCount: z.number().int().nonnegative().default(0),
});
export type CaseGoal = z.infer<typeof CaseGoalSchema>;

// --- Goal ledger payloads ---
// These live here, not in types/case.ts, so the ledger module can import
// them without a cycle: the goal schemas never import the ledger types, and
// the ledger union (types/case.ts) imports these payloads.
export const GoalSetPayloadSchema = z
    .object({
        goalId: z.string().uuid(),
        // The full goal as set, so the ledger is the audit record and a replay
        // can rebuild the goal without any other store.
        goal: CaseGoalSchema,
    })
    .superRefine((payload, ctx) => {
        if (payload.goalId !== payload.goal.goalId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'goal_set goalId must match the embedded goal',
                path: ['goalId'],
            });
        }
    });
export type GoalSetPayload = z.infer<typeof GoalSetPayloadSchema>;

export const GoalAmendedPayloadSchema = z
    .object({
        goalId: z.string().uuid(),
        previousVersion: z.number().int().positive(),
        version: z.number().int().positive(),
        amendedByTechId: z.string().min(1),
        note: z.string().min(1),
    })
    .superRefine((payload, ctx) => {
        if (payload.version !== payload.previousVersion + 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'goal_amended version must be exactly previousVersion + 1',
                path: ['version'],
            });
        }
    });
export type GoalAmendedPayload = z.infer<typeof GoalAmendedPayloadSchema>;

export const CriterionMetPayloadSchema = z.object({
    goalId: z.string().uuid(),
    criterionId: z.string().min(1),
    // The ledger entry whose evidence satisfied the criterion.
    entryId: z.string().uuid(),
    entrySequence: z.number().int().min(1),
});
export type CriterionMetPayload = z.infer<typeof CriterionMetPayloadSchema>;

export const GoalStatusChangedPayloadSchema = z.object({
    goalId: z.string().uuid(),
    from: GoalStatusSchema,
    to: GoalStatusSchema,
    authority: StatusAuthoritySchema,
    reason: z.string().min(1).optional(),
});
export type GoalStatusChangedPayload = z.infer<typeof GoalStatusChangedPayloadSchema>;
