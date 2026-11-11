import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import { validateReflectionOutput } from '../reflection';

const SHOP = 'shop-1';
const DATE = '2026-11-11';

/** Asserts the call throws an AppError with the expected code. */
function expectAppError(run: () => unknown, code: ErrorCode): void {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(code);
        return;
    }
    expect.unreachable('Expected the call to throw an AppError.');
}

function baseReport(): Record<string, unknown> {
    return {
        authority: 'reflection_only',
        kind: 'nightly_review',
        date: DATE,
        shopId: SHOP,
        telemetry: { casesReviewed: 1, overrides: 0, corrections: 0, overrideRate: 0, correctionRate: 0 },
        synthesis: 'Tech skips basics and works in metric.',
        playbookCandidates: [],
        retiredClaimIds: [],
        wikiFamilies: [],
    };
}

describe('validateReflectionOutput', () => {
    it('accepts a reflection_only nightly review', () => {
        const output = validateReflectionOutput(baseReport());
        expect(output.authority).toBe('reflection_only');
    });

    it('rejects any other authority value', () => {
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), authority: 'diagnosis' }),
            ErrorCode.VALIDATION_ERROR,
        );
    });

    it('rejects a payload that tries to carry vehicle facts', () => {
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), vehicleFacts: [{ text: 'Pads worn.' }] }),
            ErrorCode.FORBIDDEN,
        );
    });

    it('rejects a payload that tries to carry a diagnosis or a probability', () => {
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), diagnoses: ['Worn pads.'] }),
            ErrorCode.FORBIDDEN,
        );
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), probabilities: { pads: 0.9 } }),
            ErrorCode.FORBIDDEN,
        );
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), diagnosis: 'Worn pads.' }),
            ErrorCode.FORBIDDEN,
        );
        expectAppError(() => validateReflectionOutput({ ...baseReport(), probability: 0.9 }), ErrorCode.FORBIDDEN);
    });

    it('rejects an unknown key instead of silently stripping it', () => {
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), vehicleFact: 'Pads worn.' }),
            ErrorCode.FORBIDDEN,
        );
        expectAppError(
            () => validateReflectionOutput({ ...baseReport(), surpriseField: 'x' }),
            ErrorCode.VALIDATION_ERROR,
        );
    });

    it('rejects a payload carrying a forbidden key nested inside telemetry', () => {
        expectAppError(
            () =>
                validateReflectionOutput({
                    ...baseReport(),
                    telemetry: { ...baseReport().telemetry, diagnosis: 'Worn pads.' },
                }),
            ErrorCode.VALIDATION_ERROR,
        );
    });

    it('rejects a payload carrying a forbidden key nested inside a playbook candidate', () => {
        expectAppError(
            () =>
                validateReflectionOutput({
                    ...baseReport(),
                    playbookCandidates: [
                        {
                            rule: 'Measure pad thickness first.',
                            why: 'Pads wear first.',
                            diagnosticStep: 'measure-pads',
                            sourceCaseIds: ['case-1'],
                            sourceEventIds: ['e-2'],
                            confirmedByRepair: true,
                            vehicleFact: 'Pads worn.',
                        },
                    ],
                }),
            ErrorCode.VALIDATION_ERROR,
        );
    });
});
