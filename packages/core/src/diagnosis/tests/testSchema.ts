import { z } from 'zod';
import { HazardTypeSchema } from '../../types/safety';

// --- Test library (LM-34) ---
// One typed test: what it discriminates, how accurate it is, what it costs,
// what must be true before it runs, and the exact step script a tech follows.
// The planner (LM-04) reads costs and accuracies from here; it never invents
// them. Entries drafted by an LLM stay `unverified` until a human expert
// reviews them, and the library shrinks their rates until then.

export const CostTierSchema = z.enum(['ask', 'look', 'measure', 'swap', 'tear-down']);
export type CostTier = z.infer<typeof CostTierSchema>;

/** How far the vehicle must already be taken apart before the test can run. */
export const DisassemblyStateSchema = z.enum([
    'none',
    'panels-removed',
    'component-exposed',
    'component-removed',
    'teardown',
]);
export type DisassemblyState = z.infer<typeof DisassemblyStateSchema>;

export const SafetyClassSchema = z.enum(['routine', 'caution', 'hazardous']);
export type SafetyClass = z.infer<typeof SafetyClassSchema>;

export const VerificationStatusSchema = z.enum(['verified', 'unverified']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/** Who wrote the entry. An `llm-draft` stays unverified until a human reviews it. */
export const TestSourceSchema = z.enum(['expert', 'llm-draft', 'manual']);
export type TestSource = z.infer<typeof TestSourceSchema>;

// --- Expected outcome ---
// A step's expected value: one number, a range, or a plain-language outcome
// for steps where no number applies ("no smoke escapes", "steady idle").

export const ExpectedValueSchema = z
    .discriminatedUnion('kind', [
        z.object({ kind: z.literal('value'), value: z.number(), unit: z.string().min(1) }).strict(),
        z.object({ kind: z.literal('range'), min: z.number(), max: z.number(), unit: z.string().min(1) }).strict(),
        z.object({ kind: z.literal('text'), text: z.string().min(1) }).strict(),
    ])
    // The range check lives here, not on the member: a discriminated union
    // only accepts plain objects as members, and a refined member breaks it.
    .refine((expected) => expected.kind !== 'range' || expected.min < expected.max, {
        message: 'A range expected value must have min below max',
    });
export type ExpectedValue = z.infer<typeof ExpectedValueSchema>;

// --- One step of the script ---
// Location is where the tech's hands go; connection is what plugs where;
// conditions are the state the vehicle must be in for the reading to mean
// anything; outcomeYes/outcomeNo say what each answer means, so a spoken
// step never leaves the tech guessing.

export const TestStepSchema = z
    .object({
        location: z.string().min(1),
        instruction: z.string().min(1),
        connection: z.string().min(1).optional(),
        conditions: z.string().min(1).optional(),
        expected: ExpectedValueSchema,
        outcomeYes: z.string().min(1),
        outcomeNo: z.string().min(1),
    })
    .strict();
export type TestStep = z.infer<typeof TestStepSchema>;

// --- What the test discriminates ---
// hitRate is P(positive result | hypothesis true); falseAlarmRate is
// P(positive result | hypothesis false). A test that false-alarms more than
// it hits is worse than guessing, so the schema rejects it.

export const DtcCodeSchema = z.string().regex(/^[BCPU][0-9]{4}$/, 'DTC codes look like P0300, B0001, C1234, or U0100');

export const TestTargetSchema = z
    .object({
        hypothesisId: z.string().min(1),
        dtcCodes: z.array(DtcCodeSchema).optional(),
        hitRate: z.number().min(0).max(1),
        falseAlarmRate: z.number().min(0).max(1),
    })
    .strict()
    .refine((target) => target.hitRate > target.falseAlarmRate, {
        message: 'hitRate must be above falseAlarmRate: a test must beat guessing',
    });
export type TestTarget = z.infer<typeof TestTargetSchema>;

// --- Cost ---
// Labor is the tech's time. Tools are what must be in hand. Parts are what
// gets consumed or risked by running the test (a plug pulled for inspection
// is not a part cost; a gasket destroyed by opening the cover is).

export const TestPartSchema = z
    .object({
        name: z.string().min(1),
        estimatedCostUsd: z.number().min(0),
    })
    .strict();
export type TestPart = z.infer<typeof TestPartSchema>;

export const TestCostSchema = z
    .object({
        laborMinutes: z.number().int().min(0),
        tools: z.array(z.string().min(1)),
        parts: z.array(TestPartSchema),
    })
    .strict();
export type TestCost = z.infer<typeof TestCostSchema>;

// --- Preconditions ---
// A precondition with safety true is a safety gate: the test is not eligible
// until it is satisfied, and the library reports it as a safety blocker.
// Non-safety preconditions (warm engine, scan tool connected) also block
// running, but they are not safety gates.

export const TestPreconditionSchema = z
    .object({
        id: z.string().min(1),
        description: z.string().min(1),
        safety: z.boolean(),
    })
    .strict();
export type TestPrecondition = z.infer<typeof TestPreconditionSchema>;

export const TestVerificationSchema = z
    .object({
        status: VerificationStatusSchema,
        source: TestSourceSchema,
        reviewedBy: z.string().min(1).optional(),
        reviewedAt: z.string().min(1).optional(),
    })
    .strict();
export type TestVerification = z.infer<typeof TestVerificationSchema>;

// --- The test definition ---

export const TestDefinitionSchema = z
    .object({
        id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Test ids are lowercase slugs, e.g. coil-swap-p0300'),
        title: z.string().min(1),
        summary: z.string().min(1),
        costTier: CostTierSchema,
        safetyClass: SafetyClassSchema,
        hazards: z.array(HazardTypeSchema),
        disassemblyState: DisassemblyStateSchema,
        targets: z.array(TestTargetSchema).min(1),
        cost: TestCostSchema,
        preconditions: z.array(TestPreconditionSchema),
        steps: z.array(TestStepSchema).min(1),
        verification: TestVerificationSchema,
    })
    .strict()
    .superRefine((test, ctx) => {
        if (test.verification.status === 'verified' && !test.verification.reviewedBy) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'A verified test must name the human expert who reviewed it',
                path: ['verification', 'reviewedBy'],
            });
        }
        if (test.safetyClass === 'hazardous') {
            if (!test.preconditions.some((precondition) => precondition.safety)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'A hazardous test must declare at least one safety precondition',
                    path: ['preconditions'],
                });
            }
            if (test.hazards.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'A hazardous test must name at least one hazard',
                    path: ['hazards'],
                });
            }
        }
        if (test.costTier === 'ask' && test.disassemblyState !== 'none') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'An ask test is questions only: it needs no disassembly',
                path: ['disassemblyState'],
            });
        }
        if (test.costTier === 'tear-down' && test.disassemblyState === 'none') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'A tear-down test must require some disassembly',
                path: ['disassemblyState'],
            });
        }
        const hypothesisIds = new Set<string>();
        for (const target of test.targets) {
            if (hypothesisIds.has(target.hypothesisId)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate target hypothesis: ${target.hypothesisId}`,
                    path: ['targets'],
                });
            }
            hypothesisIds.add(target.hypothesisId);
        }
        const preconditionIds = new Set<string>();
        for (const precondition of test.preconditions) {
            if (preconditionIds.has(precondition.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate precondition id: ${precondition.id}`,
                    path: ['preconditions'],
                });
            }
            preconditionIds.add(precondition.id);
        }
    });
export type TestDefinition = z.infer<typeof TestDefinitionSchema>;

// --- A seed file ---
// data/tests/*.yaml holds one library file each: a version marker plus the
// tests in it. The version lets a future schema change reject old files
// instead of silently misreading them.

export const TestLibraryFileSchema = z
    .object({
        version: z.literal(1),
        tests: z.array(TestDefinitionSchema).min(1),
    })
    .strict();
export type TestLibraryFile = z.infer<typeof TestLibraryFileSchema>;
