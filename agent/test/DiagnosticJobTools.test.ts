import { describe, expect, it, vi } from 'vitest';
import { createDiagnosticJobTools, type DiagnosticJobGateway } from '../src/talker/DiagnosticJobTools';
import type { ResultInjector } from '../src/talker/ResultInjector';
import { session } from './fakes';

const JOB_ID = '00000000-0000-0000-0000-000000000001';

function setup(gatewayOverrides: Partial<DiagnosticJobGateway> = {}) {
    const gateway: DiagnosticJobGateway = {
        submitJob: vi.fn(async () => ({ jobId: JOB_ID, status: 'pending' as const })),
        getJob: vi.fn(async () => ({
            job: {
                id: JOB_ID,
                sessionId: 'session-1',
                userId: 'user-1',
                question: 'Why does it squeal?',
                evidenceRefs: [],
                vehicleSummary: '2019 Honda Civic',
                status: 'running' as const,
                ackedSeq: 0,
                createdAt: '2026-11-11T00:00:00.000Z',
                updatedAt: '2026-11-11T00:00:00.000Z',
            },
            events: [],
        })),
        cancelJob: vi.fn(async () => undefined),
        ...gatewayOverrides,
    };
    const injector = { track: vi.fn() } as unknown as ResultInjector;
    const tools = createDiagnosticJobTools(gateway, injector, session);
    return { gateway, injector, tools };
}

/** Calls a tool's execute as the agent runtime would, without a live session. */
async function run(tool: { execute: (args: never, ctx: never) => unknown }, args: never): Promise<unknown> {
    return tool.execute(args, undefined as never);
}

describe('DiagnosticJobTools', () => {
    it('consult_diagnostician files a job, tracks it, and returns the job id fast', async () => {
        const { gateway, injector, tools } = setup();
        const started = Date.now();
        const result = await run(tools.consult_diagnostician, {
            question: 'Is this the pads or the bearing?',
            evidence_refs: ['DTC C1234'],
        });
        expect(Date.now() - started).toBeLessThan(300);
        expect(result).toContain(`Diagnostic job ${JOB_ID} accepted.`);
        expect(result).toContain('Do not state a diagnosis');
        expect(gateway.submitJob).toHaveBeenCalledWith(
            expect.objectContaining({
                question: 'Is this the pads or the bearing?',
                evidenceRefs: ['DTC C1234'],
                sessionId: 'session-1',
                userId: 'user-1',
            }),
        );
        expect(injector.track).toHaveBeenCalledWith(JOB_ID);
    });

    it('consult_diagnostician keeps the talker going when the service is down, without throwing', async () => {
        const { tools } = setup({ submitJob: vi.fn(async () => { throw new Error('service down'); }) });
        const result = await run(tools.consult_diagnostician, { question: 'q', evidence_refs: [] });
        expect(result).toContain('The diagnostician is unavailable right now');
        expect(result).toContain('Do not guess a diagnosis');
    });

    it('job_status reports the latest update', async () => {
        const { tools } = setup({
            getJob: vi.fn(async () => ({
                job: { id: JOB_ID, status: 'running' },
                events: [
                    { jobId: JOB_ID, seq: 1, kind: 'progress', text: 'Checking the manual.', createdAt: '' },
                    { jobId: JOB_ID, seq: 2, kind: 'progress', text: 'Checking recalls.', createdAt: '' },
                ],
            })) as never,
        });
        const result = await run(tools.job_status, { job_id: JOB_ID });
        expect(result).toBe(`Job ${JOB_ID} is running. Latest update: Checking recalls.`);
    });

    it('job_status says so when a job has no updates yet', async () => {
        const { tools } = setup();
        const result = await run(tools.job_status, { job_id: JOB_ID });
        expect(result).toBe(`Job ${JOB_ID} is running. No updates yet.`);
    });

    it('cancel_job cancels and confirms', async () => {
        const { gateway, tools } = setup();
        const result = await run(tools.cancel_job, { job_id: JOB_ID });
        expect(result).toBe(`Diagnostic job ${JOB_ID} cancelled.`);
        expect(gateway.cancelJob).toHaveBeenCalledWith(JOB_ID);
    });

    it('cancel_job reports a failure instead of throwing', async () => {
        const { tools } = setup({ cancelJob: vi.fn(async () => { throw new Error('gone'); }) });
        const result = await run(tools.cancel_job, { job_id: JOB_ID });
        expect(result).toContain(`I could not cancel job ${JOB_ID}`);
    });
});
