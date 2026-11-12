import { describe, expect, it, vi } from 'vitest';
import type { ICaseRepository, PhysicalStep, PreActionDecision } from '@lemonade/core';
import { InMemoryConfirmationStore } from '@lemonade/core';
import type { SessionContext } from '../src/diagnosis/sessionContext';
import type { PendingStep } from '../src/talker/ResultInjector';
import {
    createLedgerStepConfirmationRecorder,
    createStepConfirmationTools,
    type PendingStepSource,
    type StepConfirmationRecorder,
} from '../src/talker/StepConfirmationTool';
import { fakeLogger, session } from './fakes';

const CASE_ID = '00000000-0000-0000-0000-000000000002';
const VIN = '1HGCM82633A004352';

const HV_STEP: PhysicalStep = {
    stepId: 'hv-isolation-test:step-2',
    testId: 'hv-isolation-test',
    instruction: 'disconnect the orange HV cables',
    safetyClass: 'hazardous',
    hazards: ['HIGH_VOLTAGE'],
    vin: VIN,
};

const HV_DECISION: PreActionDecision = {
    verdict: 'ask',
    riskLevel: 'high',
    reason: 'high-voltage system work',
    requiresConfirmation: true,
};

function pendingStep(step: PhysicalStep = HV_STEP): PendingStep {
    return {
        step,
        decision: HV_DECISION,
        jobId: '00000000-0000-0000-0000-000000000001',
        event: {
            jobId: '00000000-0000-0000-0000-000000000001',
            seq: 1,
            kind: 'measure',
            text: 'Step 2 of 3. Disconnect the orange HV cables.',
            createdAt: '2026-11-11T00:00:00.000Z',
        },
        state: { unsubscribe: () => undefined, chain: Promise.resolve(), deliveredSeq: 0 },
    };
}

/** Calls a tool's execute as the agent runtime would, without a live session. */
async function run<Args>(tool: { execute: (args: Args, ctx: never) => unknown }, args: Args): Promise<unknown> {
    return tool.execute(args, undefined as never);
}

function setup(
    options: {
        pending?: PendingStep;
        sessionContext?: SessionContext;
        recorder?: StepConfirmationRecorder;
        release?: (stepId: string) => Promise<boolean>;
    } = {},
) {
    const held = new Map<string, PendingStep>();
    if (options.pending) held.set(options.pending.step.stepId, options.pending);
    const release = vi.fn(options.release ?? (async () => true));
    const source: PendingStepSource = {
        pendingStep: (stepId: string) => held.get(stepId),
        releasePendingStep: release,
    };
    const confirmations = new InMemoryConfirmationStore();
    const recordSpy = vi.spyOn(confirmations, 'record');
    const recorderMock = vi.fn(async () => undefined);
    const recorder: StepConfirmationRecorder = options.recorder ?? { record: recorderMock };
    const tools = createStepConfirmationTools(
        source,
        confirmations,
        recorder,
        options.sessionContext ?? { ...session, caseId: CASE_ID },
        fakeLogger(),
    );
    return { source, confirmations, recordSpy, recorder, recorderMock, release, tools };
}

describe('confirm_physical_step', () => {
    it('logs the confirmation, records it, then releases the step, in that order', async () => {
        const { recorderMock, recordSpy, release, confirmations, tools } = setup({ pending: pendingStep() });
        const result = await run(tools.confirm_physical_step, {
            step_id: 'hv-isolation-test:step-2',
            confirmation_text: 'confirmed',
        });
        expect(result).toContain('confirmed and logged');
        expect(recorderMock).toHaveBeenCalledWith(
            expect.objectContaining({
                stepId: 'hv-isolation-test:step-2',
                vin: VIN,
                riskLevel: 'high',
                confirmedBy: 'voice',
                confirmationText: 'confirmed',
            }),
            HV_STEP,
            { caseId: CASE_ID, userId: 'user-1' },
        );
        expect(await confirmations.find('hv-isolation-test:step-2', VIN)).toBeDefined();
        expect(release).toHaveBeenCalledWith('hv-isolation-test:step-2');
        const order = [
            recorderMock.mock.invocationCallOrder[0],
            recordSpy.mock.invocationCallOrder[0],
            release.mock.invocationCallOrder[0],
        ];
        expect(order[0]).toBeLessThan(order[1]);
        expect(order[1]).toBeLessThan(order[2]);
    });

    it('refuses when no step is pending, and records nothing', async () => {
        const { recorderMock, recordSpy, release, tools } = setup();
        const result = await run(tools.confirm_physical_step, { step_id: 'hv-isolation-test:step-2' });
        expect(result).toContain('No physical step hv-isolation-test:step-2 is waiting for confirmation');
        expect(recorderMock).not.toHaveBeenCalled();
        expect(recordSpy).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
    });

    it('refuses when the confirmation cannot be logged, and the step stays held', async () => {
        const failing: StepConfirmationRecorder = {
            record: vi.fn(async () => {
                throw new Error('ledger down');
            }),
        };
        const { recordSpy, release, confirmations, tools } = setup({
            pending: pendingStep(),
            recorder: failing,
        });
        const result = await run(tools.confirm_physical_step, { step_id: 'hv-isolation-test:step-2' });
        expect(result).toContain('could not be logged, so the step stays held');
        expect(recordSpy).not.toHaveBeenCalled();
        expect(await confirmations.find('hv-isolation-test:step-2', VIN)).toBeUndefined();
        expect(release).not.toHaveBeenCalled();
    });

    it('refuses when the session has no case, so there is nowhere to log', async () => {
        const { recorderMock, recordSpy, release, tools } = setup({
            pending: pendingStep(),
            sessionContext: session,
        });
        const result = await run(tools.confirm_physical_step, { step_id: 'hv-isolation-test:step-2' });
        expect(result).toContain('no case ledger for this session');
        expect(recorderMock).not.toHaveBeenCalled();
        expect(recordSpy).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
    });

    it('refuses a step with no VIN to bind the confirmation to', async () => {
        const noVinStep: PhysicalStep = {
            stepId: 'hv-isolation-test:step-2',
            testId: 'hv-isolation-test',
            instruction: 'disconnect the orange HV cables',
            safetyClass: 'hazardous',
            hazards: ['HIGH_VOLTAGE'],
        };
        const { recorderMock, release, tools } = setup({ pending: pendingStep(noVinStep) });
        const result = await run(tools.confirm_physical_step, { step_id: 'hv-isolation-test:step-2' });
        expect(result).toContain('no VIN to bind a confirmation to');
        expect(recorderMock).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
    });

    it('keeps the logged confirmation when the release cannot speak the step yet', async () => {
        const { confirmations, tools } = setup({
            pending: pendingStep(),
            release: async () => false,
        });
        const result = await run(tools.confirm_physical_step, { step_id: 'hv-isolation-test:step-2' });
        expect(result).toContain('confirmed and logged, but it could not be spoken yet');
        expect(await confirmations.find('hv-isolation-test:step-2', VIN)).toBeDefined();
    });
});

describe('createLedgerStepConfirmationRecorder', () => {
    it('appends a step_confirmation entry with the tech as actor', async () => {
        const appendEntry = vi.fn(async () => undefined);
        const repository = { appendEntry } as unknown as ICaseRepository;
        const recorder = createLedgerStepConfirmationRecorder(() => repository, fakeLogger());
        await recorder.record(
            {
                stepId: 'hv-isolation-test:step-2',
                vin: VIN,
                riskLevel: 'high',
                confirmedBy: 'voice',
                confirmedAt: '2026-11-11T12:00:00.000Z',
                confirmationText: 'confirmed',
            },
            HV_STEP,
            { caseId: CASE_ID, userId: 'user-1' },
        );
        expect(appendEntry).toHaveBeenCalledWith(
            CASE_ID,
            expect.objectContaining({
                type: 'step_confirmation',
                actor: { kind: 'user', id: 'user-1' },
                source: 'tech',
                payload: expect.objectContaining({
                    stepId: 'hv-isolation-test:step-2',
                    testId: 'hv-isolation-test',
                    vin: VIN,
                    instruction: 'disconnect the orange HV cables',
                    riskLevel: 'high',
                    confirmationText: 'confirmed',
                }),
            }),
        );
    });

    it('throws when the ledger is unavailable, so the step stays held', async () => {
        const recorder = createLedgerStepConfirmationRecorder(() => undefined, fakeLogger());
        await expect(
            recorder.record(
                {
                    stepId: 'hv-isolation-test:step-2',
                    vin: VIN,
                    riskLevel: 'high',
                    confirmedBy: 'voice',
                    confirmedAt: '2026-11-11T12:00:00.000Z',
                },
                HV_STEP,
                { caseId: CASE_ID, userId: 'user-1' },
            ),
        ).rejects.toThrow('case ledger unavailable');
    });
});
