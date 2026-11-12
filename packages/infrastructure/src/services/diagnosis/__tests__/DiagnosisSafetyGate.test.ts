import { describe, expect, it, vi } from 'vitest';
import {
    InMemoryConfirmationStore,
    type IReactiveSafetyService,
    type ISafetyMonitor,
    type ILogger,
    type PhysicalStep,
} from '@lemonade/core';
import { DiagnosisSafetyGate } from '../DiagnosisSafetyGate';

const VIN = '1HGCM82633A004352';

function hvStep(): PhysicalStep {
    return {
        stepId: 'hv-isolation-test:step-2',
        testId: 'hv-isolation-test',
        instruction: 'disconnect the orange HV cables',
        safetyClass: 'hazardous',
        hazards: ['HIGH_VOLTAGE'],
        vin: VIN,
    };
}

function gate(confirmations = new InMemoryConfirmationStore()) {
    const reactive = { checkSafety: vi.fn().mockReturnValue(null) } as unknown as IReactiveSafetyService;
    const monitor = { assess: vi.fn() } as unknown as ISafetyMonitor;
    const logger: ILogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    return { gate: new DiagnosisSafetyGate(reactive, monitor, logger, confirmations), logger, confirmations };
}

describe('DiagnosisSafetyGate.checkStep', () => {
    it('asks for a scripted HV step from a live session', async () => {
        const { gate: safetyGate } = gate();
        const decision = await safetyGate.checkStep(hvStep(), 'live-session');
        expect(decision.verdict).toBe('ask');
        expect(decision.riskLevel).toBe('high');
        expect(decision.requiresConfirmation).toBe(true);
    });

    it('denies a step from a background job and logs it', async () => {
        const { gate: safetyGate, logger } = gate();
        const decision = await safetyGate.checkStep(hvStep(), 'background-job');
        expect(decision.verdict).toBe('deny');
        expect(logger.warn).toHaveBeenCalledWith(
            '[MechanicReasoning] Pre-action hook denied a step',
            expect.objectContaining({ stepId: 'hv-isolation-test:step-2' }),
        );
    });

    it('allows a risky step once its confirmation is in the shared store', async () => {
        const { gate: safetyGate, confirmations } = gate();
        await confirmations.record({
            stepId: 'hv-isolation-test:step-2',
            vin: VIN,
            riskLevel: 'high',
            confirmedBy: 'voice',
            confirmedAt: '2026-11-11T12:00:00.000Z',
        });
        const decision = await safetyGate.checkStep(hvStep(), 'live-session');
        expect(decision.verdict).toBe('allow');
    });

    it('keeps asking when the store holds a confirmation for another step', async () => {
        const { gate: safetyGate, confirmations } = gate();
        await confirmations.record({
            stepId: 'hv-isolation-test:step-1',
            vin: VIN,
            riskLevel: 'high',
            confirmedBy: 'voice',
            confirmedAt: '2026-11-11T12:00:00.000Z',
        });
        const decision = await safetyGate.checkStep(hvStep(), 'live-session');
        expect(decision.verdict).toBe('ask');
    });

    it('allows a routine step without a confirmation', async () => {
        const { gate: safetyGate } = gate();
        const decision = await safetyGate.checkStep(
            {
                stepId: 'coil-test-p0300:step-1',
                instruction: 'measure the resistance across the coil terminals',
                safetyClass: 'routine',
                hazards: [],
                vin: VIN,
            },
            'live-session',
        );
        expect(decision.verdict).toBe('allow');
        expect(decision.riskLevel).toBe('low');
    });
});
