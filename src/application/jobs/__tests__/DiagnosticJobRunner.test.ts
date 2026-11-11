import { describe, expect, it, vi } from 'vitest';
import type { IMechanicReasoningService, ILogger, NeurosymbolicState } from '@lemonade/core';
import { DiagnosticJobStore } from '../DiagnosticJobStore';
import { runDiagnosticJob } from '../DiagnosticJobRunner';

const silentLogger: ILogger = {
    info: () => undefined,
    error: vi.fn(),
    warn: () => undefined,
    debug: () => undefined,
};

function state(decision: NeurosymbolicState['finalDiagnosis']['decision']): NeurosymbolicState {
    return {
        finalDiagnosis: {
            decision,
            reasoningTrace: 'trace',
            userOutput: 'Replace the ABS sensor.',
            requiredActions: [],
            metaConfidence: 0.9,
        },
        authorityData: { vin: 'VIN', nhtsaRecalls: [], manualSpecs: null, safetyAlerts: [] },
    } as NeurosymbolicState;
}

function setup(diagnose: IMechanicReasoningService['diagnose']) {
    const store = new DiagnosticJobStore();
    const reasoner: IMechanicReasoningService = { diagnose };
    const job = store.create({
        question: 'Why does it squeal?',
        evidenceRefs: [],
        caseId: '00000000-0000-0000-0000-000000000001',
        sessionId: 'session-1',
        userId: 'user-1',
        vehicle: { year: 2019, make: 'Honda', model: 'Civic' },
    });
    return { store, reasoner, job };
}

describe('runDiagnosticJob', () => {
    it('emits progress and a snapshot, then the finding, and succeeds the job', async () => {
        const { store, reasoner, job } = setup(async () => state('PROCEED'));
        await runDiagnosticJob({ store, reasoner, logger: silentLogger }, job, {
            question: job.question,
            evidenceRefs: [],
            caseId: job.caseId,
            sessionId: job.sessionId,
            userId: job.userId,
            vehicle: { year: 2019, make: 'Honda', model: 'Civic' },
        });
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['progress', 'snapshot', 'finding']);
        expect(store.eventsFor(job.id)[2].text).toBe('Replace the ABS sensor.');
        expect(store.get(job.id)?.status).toBe('succeeded');
    });

    it('maps a STOP_DANGER verdict to a safety stop', async () => {
        const { store, reasoner, job } = setup(async () => state('STOP_DANGER'));
        await runDiagnosticJob({ store, reasoner, logger: silentLogger }, job, {
            question: job.question,
            evidenceRefs: [],
            sessionId: job.sessionId,
            userId: job.userId,
            vehicle: {},
        });
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['progress', 'snapshot', 'safety_stop']);
        expect(store.get(job.id)?.status).toBe('succeeded');
    });

    it('emits a failed event when the reasoner throws', async () => {
        const { store, reasoner, job } = setup(async () => {
            throw new Error('reasoner down');
        });
        await runDiagnosticJob({ store, reasoner, logger: silentLogger }, job, {
            question: job.question,
            evidenceRefs: [],
            sessionId: job.sessionId,
            userId: job.userId,
            vehicle: {},
        });
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['progress', 'snapshot', 'failed']);
        expect(store.get(job.id)?.status).toBe('failed');
        expect(silentLogger.error).toHaveBeenCalledWith('Diagnostic job failed', expect.any(Error), { jobId: job.id });
    });

    it('drops the result when the job was cancelled mid-run', async () => {
        let resolveDiagnose!: (value: NeurosymbolicState) => void;
        const pending = new Promise<NeurosymbolicState>((resolve) => {
            resolveDiagnose = resolve;
        });
        const { store, reasoner, job } = setup(() => pending);
        const running = runDiagnosticJob({ store, reasoner, logger: silentLogger }, job, {
            question: job.question,
            evidenceRefs: [],
            sessionId: job.sessionId,
            userId: job.userId,
            vehicle: {},
        });
        store.cancel(job.id);
        resolveDiagnose(state('PROCEED'));
        await running;
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['progress', 'snapshot', 'cancelled']);
    });
});
