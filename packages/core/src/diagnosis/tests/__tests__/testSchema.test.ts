import { describe, it, expect } from 'vitest';
import { TestDefinitionSchema, TestLibraryFileSchema } from '../testSchema';
import { validTestDefinition } from './testDefinitionFactory';

describe('TestDefinitionSchema', () => {
    it('accepts a complete, verified definition', () => {
        const parsed = TestDefinitionSchema.parse(validTestDefinition());
        expect(parsed.id).toBe('measure-oxygen-sensor-switching');
    });

    it('rejects a test with no steps', () => {
        const result = TestDefinitionSchema.safeParse(validTestDefinition({ steps: [] }));
        expect(result.success).toBe(false);
    });

    it('rejects a test with no targets', () => {
        const result = TestDefinitionSchema.safeParse(validTestDefinition({ targets: [] }));
        expect(result.success).toBe(false);
    });

    it('rejects a step with no expected value', () => {
        const definition = validTestDefinition();
        const { expected: _expected, ...stepWithoutExpected } = definition.steps[0];
        const result = TestDefinitionSchema.safeParse(validTestDefinition({ steps: [stepWithoutExpected] }));
        expect(result.success).toBe(false);
    });

    it('rejects a step with no yes/no outcome', () => {
        const definition = validTestDefinition();
        const { outcomeNo: _outcomeNo, ...stepWithoutOutcome } = definition.steps[0];
        const result = TestDefinitionSchema.safeParse(validTestDefinition({ steps: [stepWithoutOutcome] }));
        expect(result.success).toBe(false);
    });

    it('rejects a target whose false-alarm rate beats its hit rate', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                targets: [{ hypothesisId: 'catalyst-degraded', hitRate: 0.3, falseAlarmRate: 0.4 }],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects rates outside 0 to 1', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                targets: [{ hypothesisId: 'catalyst-degraded', hitRate: 1.2, falseAlarmRate: 0.1 }],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a malformed DTC code', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                targets: [{ hypothesisId: 'catalyst-degraded', dtcCodes: ['P420'], hitRate: 0.8, falseAlarmRate: 0.1 }],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a verified test with no named reviewer', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({ verification: { status: 'verified', source: 'expert' } }),
        );
        expect(result.success).toBe(false);
    });

    it('accepts an unverified LLM draft with no reviewer', () => {
        const parsed = TestDefinitionSchema.parse(
            validTestDefinition({ verification: { status: 'unverified', source: 'llm-draft' } }),
        );
        expect(parsed.verification.status).toBe('unverified');
    });

    it('rejects a hazardous test with no safety precondition', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                safetyClass: 'hazardous',
                hazards: ['FIRE_RISK'],
                preconditions: [{ id: 'engine-warm', description: 'Engine warm.', safety: false }],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a hazardous test with no named hazard', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                safetyClass: 'hazardous',
                hazards: [],
                preconditions: [{ id: 'no-ignition-sources', description: 'No flames.', safety: true }],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects an ask test that needs disassembly', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({ costTier: 'ask', disassemblyState: 'panels-removed' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a tear-down test that needs no disassembly', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({ costTier: 'tear-down', disassemblyState: 'none' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a test targeting the same hypothesis twice', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                targets: [
                    { hypothesisId: 'catalyst-degraded', hitRate: 0.8, falseAlarmRate: 0.1 },
                    { hypothesisId: 'catalyst-degraded', hitRate: 0.7, falseAlarmRate: 0.2 },
                ],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects duplicate precondition ids', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                preconditions: [
                    { id: 'ventilation', description: 'Ventilate.', safety: true },
                    { id: 'ventilation', description: 'Ventilate again.', safety: true },
                ],
            }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a non-slug id', () => {
        const result = TestDefinitionSchema.safeParse(validTestDefinition({ id: 'Measure O2!' }));
        expect(result.success).toBe(false);
    });

    it('rejects unknown top-level fields', () => {
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({ notes: 'extra field' } as unknown as Partial<ReturnType<typeof validTestDefinition>>),
        );
        expect(result.success).toBe(false);
    });

    it('rejects a range expected value with min above max', () => {
        const definition = validTestDefinition();
        const result = TestDefinitionSchema.safeParse(
            validTestDefinition({
                steps: [
                    {
                        ...definition.steps[0],
                        expected: { kind: 'range', min: 0.9, max: 0.1, unit: 'volts' },
                    },
                ],
            }),
        );
        expect(result.success).toBe(false);
    });
});

describe('TestLibraryFileSchema', () => {
    it('accepts a version 1 file', () => {
        const parsed = TestLibraryFileSchema.parse({ version: 1, tests: [validTestDefinition()] });
        expect(parsed.tests).toHaveLength(1);
    });

    it('rejects a file with the wrong version', () => {
        const result = TestLibraryFileSchema.safeParse({ version: 2, tests: [validTestDefinition()] });
        expect(result.success).toBe(false);
    });

    it('rejects a file with no tests', () => {
        const result = TestLibraryFileSchema.safeParse({ version: 1, tests: [] });
        expect(result.success).toBe(false);
    });
});
