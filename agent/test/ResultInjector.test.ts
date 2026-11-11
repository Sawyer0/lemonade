import { describe, expect, it, vi } from 'vitest';
import type { DiagnosticJob, DiagnosticJobEvent, DiagnosticJobEventKind } from '@lemonade/core';
import { ResultInjector, type JobEventSource } from '../src/talker/ResultInjector';
import type { DeliveryOutcome, TalkerSession } from '../src/talker/TalkerSession';
import { fakeLogger } from './fakes';

const JOB_ID = '00000000-0000-0000-0000-000000000001';
const CASE_ID = '00000000-0000-0000-0000-000000000002';

function event(seq: number, kind: DiagnosticJobEventKind, text: string): DiagnosticJobEvent {
    return { jobId: JOB_ID, seq, kind, text, createdAt: '2026-11-11T00:00:00.000Z' };
}

function job(overrides: Partial<DiagnosticJob> = {}): DiagnosticJob {
    return {
        id: JOB_ID,
        caseId: CASE_ID,
        sessionId: 'session-1',
        userId: 'user-1',
        question: 'Why does it squeal?',
        evidenceRefs: [],
        vehicleSummary: '2019 Honda Civic',
        status: 'running',
        ackedSeq: 0,
        createdAt: '2026-11-11T00:00:00.000Z',
        updatedAt: '2026-11-11T00:00:00.000Z',
        ...overrides,
    };
}

function fakeTalkerSession(outcomes: DeliveryOutcome[] = []) {
    const calls: Array<{ method: string; text: string }> = [];
    const session: TalkerSession = {
        addSilentContext: vi.fn(async (text: string) => {
            calls.push({ method: 'addSilentContext', text });
        }),
        speakAtIdle: vi.fn(async (text: string) => {
            calls.push({ method: 'speakAtIdle', text });
            return outcomes.shift() ?? 'delivered';
        }),
        interruptAndSpeak: vi.fn(async (text: string) => {
            calls.push({ method: 'interruptAndSpeak', text });
        }),
    };
    return { session, calls };
}

/** A job service fake: subscriptions deliver whatever the test emits. */
function fakeJobSource(jobsForCase: DiagnosticJob[] = [], ackFailures = 0) {
    const subscribers = new Map<
        string,
        { onEvent: (event: DiagnosticJobEvent) => void; onError: (error: Error) => void }
    >();
    const acks: number[] = [];
    const ackCalls: number[] = [];
    let failuresLeft = ackFailures;
    const source: JobEventSource = {
        subscribe: vi.fn((jobId: string, handlers) => {
            subscribers.set(jobId, handlers);
            return () => subscribers.delete(jobId);
        }),
        listJobsForCase: vi.fn(async () => jobsForCase),
        acknowledge: vi.fn(async (_jobId: string, seq: number) => {
            ackCalls.push(seq);
            if (failuresLeft > 0) {
                failuresLeft -= 1;
                throw new Error('ack failed');
            }
            acks.push(seq);
        }),
    };
    return {
        source,
        acks,
        ackCalls,
        emit: (jobId: string, jobEvent: DiagnosticJobEvent) => subscribers.get(jobId)?.onEvent(jobEvent),
        fail: (jobId: string, error: Error) => subscribers.get(jobId)?.onError(error),
        subscribed: (jobId: string) => subscribers.has(jobId),
    };
}

async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ResultInjector', () => {
    it('sends progress and snapshots as silent context, never spoken', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'progress', 'Checking the manual.'));
        jobs.emit(JOB_ID, event(2, 'snapshot', 'Case 1 · 2019 Honda Civic · Question: Why?'));
        await flush();
        expect(calls).toEqual([
            { method: 'addSilentContext', text: 'Checking the manual.' },
            { method: 'addSilentContext', text: 'Case 1 · 2019 Honda Civic · Question: Why?' },
        ]);
        expect(jobs.acks).toEqual([1, 2]);
    });

    it('speaks a finding at the next idle gap and acks it', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'finding', 'Replace the ABS sensor.'));
        await flush();
        expect(calls).toEqual([{ method: 'speakAtIdle', text: 'Replace the ABS sensor.' }]);
        expect(jobs.acks).toEqual([1]);
    });

    it('retries a failed ack, so a transient failure does not replay a delivered finding', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource([], 2);
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'finding', 'Replace the ABS sensor.'));
        await flush();
        expect(calls).toEqual([{ method: 'speakAtIdle', text: 'Replace the ABS sensor.' }]);
        await vi.waitFor(() => expect(jobs.ackCalls).toEqual([1, 1, 1]), { timeout: 5_000 });
        expect(jobs.acks).toEqual([1]);
    });

    it('re-queues a finding talked over by the user, and never cancels the job', async () => {
        const { session, calls } = fakeTalkerSession(['interrupted', 'delivered']);
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'measure', 'Measure fuel pressure.'));
        await flush();
        expect(calls).toEqual([
            { method: 'speakAtIdle', text: 'Measure fuel pressure.' },
            { method: 'speakAtIdle', text: 'Measure fuel pressure.' },
        ]);
        expect(jobs.acks).toEqual([1]);
        expect(jobs.subscribed(JOB_ID)).toBe(false); // terminal event: untracked after delivery
    });

    it('abandons a finding after retries without acking it, so a resume can retry', async () => {
        const { session, calls } = fakeTalkerSession(['interrupted', 'interrupted', 'interrupted']);
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'finding', 'Replace the sensor.'));
        await flush();
        expect(calls).toHaveLength(3);
        expect(jobs.acks).toEqual([]);
    });

    it('interrupts mid-sentence for a safety stop', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'safety_stop', 'Stop. High voltage. Do not touch the orange cables.'));
        await flush();
        expect(calls).toEqual([
            { method: 'interruptAndSpeak', text: 'Stop. High voltage. Do not touch the orange cables.' },
        ]);
        expect(jobs.acks).toEqual([1]);
    });

    it('reports a failed job as silent context', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'failed', 'The diagnostician errored.'));
        await flush();
        expect(calls).toEqual([
            { method: 'addSilentContext', text: `Diagnostic job ${JOB_ID} failed: The diagnostician errored.` },
        ]);
    });

    it('skips events at or below the acked seq on resume, and still delivers a result that finished while away', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource([job({ status: 'succeeded', ackedSeq: 1 })]);
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        await injector.resumeForCase(CASE_ID);
        // Replay: seq 1 was already delivered before the disconnect; seq 2 is the finding.
        jobs.emit(JOB_ID, event(1, 'progress', 'Checking the manual.'));
        jobs.emit(JOB_ID, event(2, 'finding', 'Replace the ABS sensor.'));
        await flush();
        expect(calls).toEqual([{ method: 'speakAtIdle', text: 'Replace the ABS sensor.' }]);
        expect(jobs.acks).toEqual([2]);
    });

    it('serialises deliveries for one job in arrival order', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        injector.track(JOB_ID);
        // Both events land on the same serial chain; order is preserved.
        jobs.emit(JOB_ID, event(1, 'progress', 'First.'));
        jobs.emit(JOB_ID, event(2, 'finding', 'Second.'));
        await flush();
        expect(calls.map((call) => call.text)).toEqual(['First.', 'Second.']);
    });

    it('logs a stream failure and stops everything on stop()', async () => {
        const { session } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const logger = fakeLogger();
        const injector = new ResultInjector(jobs.source, session, logger);
        injector.track(JOB_ID);
        jobs.fail(JOB_ID, new Error('connection reset'));
        await flush();
        expect(logger.error).toHaveBeenCalledWith('Job event stream failed', expect.any(Error), { jobId: JOB_ID });
        injector.stop();
        expect(jobs.subscribed(JOB_ID)).toBe(false);
        injector.track(JOB_ID);
        expect(jobs.subscribed(JOB_ID)).toBe(false);
    });
});
