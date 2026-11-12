// Decision-theoretic diagnostic loop (LM-04): the typed contract for a
// ranked differential, cost-based next test, and stop/escalate.
//
// The loop is pure: it takes priors (LM-33), test definitions with real
// hit/false-alarm rates (LM-34), and recorded test results, and returns a
// differential, a next test, and a decision. The LLM may propose hypothesis
// names; it never sets a number — every number here traces to a prior, a
// test rate, or a recorded result, and each update leaves a trace entry so
// the number can be recomputed from the ledger.
import { z } from 'zod';
import type { DisassemblyState, TestDefinition, TestStep } from '../tests/testSchema';

export const HypothesisSourceSchema = z.enum(['field-fix-prior', 'llm-proposed', 'knowledge-graph']);
export type HypothesisSource = z.infer<typeof HypothesisSourceSchema>;

export const LoopHypothesisSchema = z
    .object({
        id: z.string().min(1),
        label: z.string().min(1),
        probability: z.number().min(0).max(1),
        source: HypothesisSourceSchema,
        n: z.number().int().min(0).optional(),
        provenance: z.array(z.string().min(1)),
    })
    .strict();
export type LoopHypothesis = z.infer<typeof LoopHypothesisSchema>;

export const DifferentialSchema = z
    .object({
        hypotheses: z.array(LoopHypothesisSchema),
        otherProbability: z.number().min(0).max(1),
        round: z.number().int().min(0),
    })
    .strict();
export type Differential = z.infer<typeof DifferentialSchema>;

export const TestOutcomeSchema = z.enum(['positive', 'negative']);
export type TestOutcome = z.infer<typeof TestOutcomeSchema>;

export const TestResultSourceSchema = z.enum(['tech', 'obd', 'reasoner']);
export type TestResultSource = z.infer<typeof TestResultSourceSchema>;

/** One recorded test result: the loop never trusts a result without its test id and outcome. */
export const TestResultInputSchema = z
    .object({
        testId: z.string().min(1),
        outcome: TestOutcomeSchema,
        source: TestResultSourceSchema,
        recordedAt: z.string().min(1).optional(),
    })
    .strict();
export type TestResultInput = z.infer<typeof TestResultInputSchema>;

/** One Bayes update, recorded so the posterior can be recomputed from data alone. */
export const LoopTraceEntrySchema = z
    .object({
        round: z.number().int().min(0),
        testId: z.string().min(1),
        outcome: TestOutcomeSchema,
        /** The hypothesis this entry is for, or 'other' for the OTHER bucket. Hypotheses the test does not target get no entry: their likelihood is 1, so their posterior is prior over the total the entries here determine. */
        hypothesisId: z.string().min(1),
        priorProbability: z.number().min(0).max(1),
        posteriorProbability: z.number().min(0).max(1),
        hitRate: z.number().min(0).max(1),
        falseAlarmRate: z.number().min(0).max(1),
    })
    .strict();
export type LoopTraceEntry = z.infer<typeof LoopTraceEntrySchema>;

export const CostBreakdownSchema = z
    .object({
        laborUsd: z.number().min(0),
        partsUsd: z.number().min(0),
        downtimeUsd: z.number().min(0),
        riskUsd: z.number().min(0),
        totalUsd: z.number().min(0),
    })
    .strict();
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

/** The next step, ready for the live agent to speak: location, connection, conditions, expected value, yes/no. */
export const NextTestSchema = z
    .object({
        testId: z.string().min(1),
        title: z.string().min(1),
        costTier: z.enum(['ask', 'look', 'measure', 'swap', 'tear-down']),
        cost: CostBreakdownSchema,
        /** Probability the test resolves the case, per dollar spent. */
        expectedValuePerDollar: z.number().min(0),
        /** Probability the test discriminates the leading hypotheses. */
        discriminationProbability: z.number().min(0).max(1),
        steps: z.array(z.custom<TestStep>()),
        spoken: z.array(z.string().min(1)),
        safetyBlockers: z.array(z.string().min(1)),
    })
    .strict();
export type NextTest = z.infer<typeof NextTestSchema>;

export const LoopDecisionSchema = z.discriminatedUnion('kind', [
    z
        .object({ kind: z.literal('next-test'), nextTest: NextTestSchema, challenger: NextTestSchema.nullable() })
        .strict(),
    z
        .object({
            kind: z.literal('repair'),
            hypothesisId: z.string().min(1),
            expectedRepairCostUsd: z.number().min(0).optional(),
            reason: z.string().min(1),
        })
        .strict(),
    z
        .object({
            kind: z.literal('escalate'),
            reason: z.enum([
                'other-too-high',
                'evidence-inconsistent',
                'budget-exhausted',
                'rounds-exhausted',
                'safety-critical-unresolved',
                'no-discriminating-test',
            ]),
            detail: z.string().min(1),
        })
        .strict(),
    z.object({ kind: z.literal('verify-fix'), hypothesisId: z.string().min(1) }).strict(),
    z.object({ kind: z.literal('closed'), hypothesisId: z.string().min(1) }).strict(),
]);
export type LoopDecision = z.infer<typeof LoopDecisionSchema>;

export const DiagnosticLoopStateSchema = z
    .object({
        differential: DifferentialSchema,
        disassemblyState: z.custom<DisassemblyState>(),
        satisfiedPreconditionIds: z.array(z.string().min(1)),
        spentUsd: z.number().min(0),
        budgetUsd: z.number().min(0),
        safetyCriticalHypothesisIds: z.array(z.string().min(1)),
        repairCostsUsd: z.record(z.string(), z.number().min(0)),
        /** Tests already run: the planner never picks one twice. */
        completedTestIds: z.array(z.string().min(1)),
        history: z.array(LoopTraceEntrySchema),
        decision: LoopDecisionSchema.nullable(),
        repairedHypothesisId: z.string().min(1).optional(),
    })
    .strict();
export type DiagnosticLoopState = z.infer<typeof DiagnosticLoopStateSchema>;

/** Everything the loop needs to start: priors, the test library, and what is already known. */
export const DiagnosticLoopInputSchema = z
    .object({
        priorHypotheses: z.array(
            z.object({
                hypothesis: z.string().min(1),
                n: z.number().int().min(0),
                pi: z.number().min(0).max(1),
                sources: z.array(z.object({ source: z.string().min(1), observationCount: z.number().int().min(0) })),
            }),
        ),
        llmHypotheses: z.array(z.string().min(1)).optional(),
        testDefinitions: z.array(z.custom<TestDefinition>()),
        recordedResults: z.array(TestResultInputSchema).optional(),
        budgetUsd: z.number().min(0).optional(),
        disassemblyState: z.custom<DisassemblyState>().optional(),
        satisfiedPreconditionIds: z.array(z.string().min(1)).optional(),
        safetyCriticalHypothesisIds: z.array(z.string().min(1)).optional(),
        tsbBoostedHypothesisIds: z.array(z.string().min(1)).optional(),
        knowledgePriors: z.record(z.string(), z.number().min(0).max(1)).optional(),
        repairCostsUsd: z.record(z.string(), z.number().min(0)).optional(),
        interactive: z.boolean().optional(),
    })
    .strict();
export type DiagnosticLoopInput = z.infer<typeof DiagnosticLoopInputSchema>;
