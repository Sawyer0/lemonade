import { describe, expect, it } from 'vitest';
import {
    InMemoryConfirmationStore,
    authorizeStep,
    buildConfirmationPrompt,
    confirmationMatches,
    evaluatePreActionStep,
    riskCategoryForHazard,
    stepIdFor,
    type PhysicalStep,
    type StepConfirmation,
} from '../policy';

const VIN = '1HGCM82633A004352';

function step(overrides: Partial<PhysicalStep> = {}): PhysicalStep {
    return {
        stepId: 'coil-test-p0300:step-1',
        testId: 'coil-test-p0300',
        instruction: 'measure the resistance across the coil terminals',
        safetyClass: 'routine',
        hazards: [],
        vin: VIN,
        ...overrides,
    };
}

function confirmation(overrides: Partial<StepConfirmation> = {}): StepConfirmation {
    return {
        stepId: 'coil-test-p0300:step-1',
        vin: VIN,
        riskLevel: 'high',
        confirmedBy: 'voice',
        confirmedAt: '2026-11-11T12:00:00.000Z',
        ...overrides,
    };
}

describe('evaluatePreActionStep', () => {
    it('allows a routine step with no hazards at low risk', () => {
        expect(evaluatePreActionStep(step(), 'live-session')).toEqual({
            verdict: 'allow',
            riskLevel: 'low',
            reason: 'This is a routine step.',
            requiresConfirmation: false,
        });
    });

    it('asks at high risk for a hazardous high-voltage step', () => {
        const decision = evaluatePreActionStep(
            step({
                safetyClass: 'hazardous',
                hazards: ['HIGH_VOLTAGE'],
                instruction: 'disconnect the orange HV cables',
            }),
            'live-session',
        );
        expect(decision.verdict).toBe('ask');
        expect(decision.riskLevel).toBe('high');
        expect(decision.requiresConfirmation).toBe(true);
        expect(decision.reason).toContain('high-voltage system work');
    });

    it('asks at high risk for fuel work even when the class is routine', () => {
        const decision = evaluatePreActionStep(step({ hazards: ['FUEL_LEAK'] }), 'live-session');
        expect(decision).toMatchObject({ verdict: 'ask', riskLevel: 'high', requiresConfirmation: true });
        expect(decision.reason).toContain('fuel system work');
    });

    it('asks at high risk for lifting work', () => {
        const decision = evaluatePreActionStep(step({ hazards: ['SUSPENDED_LOAD'] }), 'live-session');
        expect(decision).toMatchObject({ verdict: 'ask', riskLevel: 'high' });
        expect(decision.reason).toContain('lifting the vehicle');
    });

    it('asks at high risk for running-engine work', () => {
        for (const hazard of ['ROTATING_PARTS', 'CARBON_MONOXIDE', 'EXHAUST_FUMES'] as const) {
            const decision = evaluatePreActionStep(step({ hazards: [hazard] }), 'live-session');
            expect(decision).toMatchObject({ verdict: 'ask', riskLevel: 'high' });
            expect(decision.reason).toContain('running-engine work');
        }
    });

    it('asks at elevated risk for a caution step with no listed hazard', () => {
        const decision = evaluatePreActionStep(step({ safetyClass: 'caution' }), 'live-session');
        expect(decision).toMatchObject({ verdict: 'ask', riskLevel: 'elevated', requiresConfirmation: true });
    });

    it('denies every step from a background job, even a routine one', () => {
        const decision = evaluatePreActionStep(step(), 'background-job');
        expect(decision.verdict).toBe('deny');
        expect(decision.riskLevel).toBe('high');
        expect(decision.reason).toContain('Background jobs can never issue a physical step');
    });

    it('denies a step when the safety check failed, failing closed', () => {
        const decision = evaluatePreActionStep(step({ hazards: ['SAFETY_CHECK_FAILED'] }), 'live-session');
        expect(decision.verdict).toBe('deny');
    });

    it('denies a risky step with no VIN instead of asking for an unbindable confirmation', () => {
        const decision = evaluatePreActionStep(
            {
                stepId: 'hv-test:step-1',
                instruction: 'disconnect the orange HV cables',
                safetyClass: 'hazardous',
                hazards: ['HIGH_VOLTAGE'],
            },
            'live-session',
        );
        expect(decision.verdict).toBe('deny');
        expect(decision.reason).toContain('no 17-character VIN');
    });

    it('denies a risky step with a short VIN', () => {
        const decision = evaluatePreActionStep(step({ hazards: ['HIGH_VOLTAGE'], vin: 'ABC123' }), 'live-session');
        expect(decision.verdict).toBe('deny');
    });

    it('maps each risky hazard to its category', () => {
        expect(riskCategoryForHazard('HIGH_VOLTAGE')).toBe('hv-system');
        expect(riskCategoryForHazard('ELECTRICAL_SHORT')).toBe('hv-system');
        expect(riskCategoryForHazard('FUEL_LEAK')).toBe('fuel');
        expect(riskCategoryForHazard('JACK_STAND_MISSING')).toBe('lifting');
        expect(riskCategoryForHazard('ROTATING_PARTS')).toBe('running-engine');
        expect(riskCategoryForHazard('HOT_SURFACES')).toBeUndefined();
    });
});

describe('authorizeStep', () => {
    it('keeps asking when no confirmation is on file', async () => {
        const store = new InMemoryConfirmationStore();
        const decision = await authorizeStep(step({ hazards: ['HIGH_VOLTAGE'] }), 'live-session', store);
        expect(decision.verdict).toBe('ask');
    });

    it('allows a risky step once its confirmation is on file', async () => {
        const store = new InMemoryConfirmationStore();
        await store.record(confirmation());
        const decision = await authorizeStep(step({ hazards: ['HIGH_VOLTAGE'] }), 'live-session', store);
        expect(decision.verdict).toBe('allow');
        expect(decision.reason).toContain('Spoken confirmation on file');
        expect(decision.requiresConfirmation).toBe(false);
    });

    it('does not allow a step on a confirmation for a different step', async () => {
        const store = new InMemoryConfirmationStore();
        await store.record(confirmation({ stepId: 'other-test:step-1' }));
        const decision = await authorizeStep(step({ hazards: ['HIGH_VOLTAGE'] }), 'live-session', store);
        expect(decision.verdict).toBe('ask');
    });

    it('does not allow a step on a confirmation for a different VIN', async () => {
        const store = new InMemoryConfirmationStore();
        await store.record(confirmation({ vin: '1HGCM82633A004353' }));
        const decision = await authorizeStep(step({ hazards: ['HIGH_VOLTAGE'] }), 'live-session', store);
        expect(decision.verdict).toBe('ask');
    });

    it('never allows a background job, even with a confirmation on file', async () => {
        const store = new InMemoryConfirmationStore();
        await store.record(confirmation());
        const decision = await authorizeStep(step(), 'background-job', store);
        expect(decision.verdict).toBe('deny');
    });
});

describe('confirmationMatches', () => {
    it('matches only the exact step id and VIN', () => {
        const recorded = confirmation();
        expect(confirmationMatches(recorded, 'coil-test-p0300:step-1', VIN)).toBe(true);
        expect(confirmationMatches(recorded, 'coil-test-p0300:step-2', VIN)).toBe(false);
        expect(confirmationMatches(recorded, 'coil-test-p0300:step-1', '1HGCM82633A004353')).toBe(false);
    });
});

describe('stepIdFor', () => {
    it('names steps 1-based within their test', () => {
        expect(stepIdFor('hv-isolation-test', 0)).toBe('hv-isolation-test:step-1');
        expect(stepIdFor('hv-isolation-test', 1)).toBe('hv-isolation-test:step-2');
    });
});

describe('buildConfirmationPrompt', () => {
    it('names the risk and the instruction and requires the word confirmed', () => {
        const prompt = buildConfirmationPrompt(step({ instruction: 'disconnect the orange HV cables' }), {
            verdict: 'ask',
            riskLevel: 'high',
            reason: 'r',
            requiresConfirmation: true,
        });
        expect(prompt).toBe(
            'Before you disconnect the orange HV cables, this is a high-risk step. ' +
                'Say "confirmed" only when you are ready, and do not start until then.',
        );
    });
});
