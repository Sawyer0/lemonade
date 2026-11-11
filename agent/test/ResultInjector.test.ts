import { describe, expect, it, vi } from 'vitest';
import type {
    DiagnosticJob,
    DiagnosticJobEvent,
    DiagnosticJobEventKind,
    JobStep,
    PhysicalStep,
    PreActionHook,
    StepOrigin,
} from '@lemonade/core';
import { InMemoryConfirmationStore, authorizeStep, buildConfirmationPrompt } from '@lemonade/core';
import { ResultInjector, type JobEventSource } from '../src/talker/ResultInjector';
import type { DeliveryOutcome, TalkerSession } from '../src/talker/TalkerSession';
import { fakeLogger } from './fakes';

const JOB_ID = '00000000-0000-0000-0000-000000000001';
const CASE_ID = '00000000-0000-0000-0000-000000000002';
const VIN = '1HGCM82633A004352';

const HV_STEP: JobStep = {
    stepId: 'hv-isolation-test:step-2',
    testId: 'hv-isolation-test',
    instruction: 'disconnect the orange HV cables',
    safetyClass: 'hazardous',
    hazards: ['HIGH_VOLTAGE'],
    vin: VIN,
    origin: 'live-session',
};

function event(seq: number, kind: DiagnosticJobEventKind, text: string, step?: JobStep): DiagnosticJobEvent {
    return { jobId: JOB_ID, seq, kind, text, ...(step ? { step } : {}), createdAt: '2026-11-11T00:00:00.000Z' };
}

/** The real pre-action policy, backed by a session confirmation store. */
function hookWith(store: InMemoryConfirmationStore): PreActionHook {
    return {
        checkStep: (step: PhysicalStep, origin: StepOrigin) => authorizeStep(step, origin, store),
    };
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

    it('untracks a finished job on resume when its terminal event was already acked', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource([job({ status: 'succeeded', ackedSeq: 2 })]);
        const injector = new ResultInjector(jobs.source, session, fakeLogger());
        await injector.resumeForCase(CASE_ID);
        expect(jobs.subscribed(JOB_ID)).toBe(true);
        // Replay of a job whose events were all delivered before the disconnect.
        jobs.emit(JOB_ID, event(1, 'progress', 'Checking the manual.'));
        jobs.emit(JOB_ID, event(2, 'finding', 'Replace the ABS sensor.'));
        await flush();
        expect(calls).toEqual([]); // nothing to say again
        expect(jobs.acks).toEqual([]); // nothing new to acknowledge
        expect(jobs.subscribed(JOB_ID)).toBe(false); // terminal event seen: no resubscribe loop
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

    it('never speaks a scripted HV step without a logged confirmation: it asks instead', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const store = new InMemoryConfirmationStore();
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), hookWith(store));
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'measure', 'Step 2 of 3. Disconnect the orange HV cables.', HV_STEP));
        await flush();
        expect(calls).toHaveLength(2);
        expect(calls[0]).toEqual({
            method: 'speakAtIdle',
            text: buildConfirmationPrompt(
                {
                    stepId: HV_STEP.stepId,
                    testId: HV_STEP.testId,
                    instruction: HV_STEP.instruction,
                    safetyClass: HV_STEP.safetyClass,
                    hazards: HV_STEP.hazards,
                    vin: HV_STEP.vin,
                },
                { verdict: 'ask', riskLevel: 'high', reason: '', requiresConfirmation: true },
            ),
        });
        expect(calls[1].method).toBe('addSilentContext');
        expect(calls[1].text).toContain('hv-isolation-test:step-2');
        expect(calls[1].text).toContain('must NOT be spoken yet');
        expect(calls.map((call) => call.text)).not.toContain('Step 2 of 3. Disconnect the orange HV cables.');
        expect(jobs.acks).toEqual([]); // held, not delivered: a resume replays it
        expect(jobs.subscribed(JOB_ID)).toBe(true);
        expect(injector.pendingStep('hv-isolation-test:step-2')?.step.stepId).toBe('hv-isolation-test:step-2');
    });

    it('speaks a held HV step after its confirmation is logged', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const store = new InMemoryConfirmationStore();
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), hookWith(store));
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'measure', 'Step 2 of 3. Disconnect the orange HV cables.', HV_STEP));
        await flush();
        expect(jobs.acks).toEqual([]);
        await store.record({
            stepId: 'hv-isolation-test:step-2',
            vin: VIN,
            riskLevel: 'high',
            confirmedBy: 'voice',
            confirmedAt: '2026-11-11T12:00:00.000Z',
        });
        expect(await injector.releasePendingStep('hv-isolation-test:step-2')).toBe(true);
        await flush();
        expect(calls.map((call) => call.text)).toContain('Step 2 of 3. Disconnect the orange HV cables.');
        expect(jobs.acks).toEqual([1]);
        expect(jobs.subscribed(JOB_ID)).toBe(false);
        expect(injector.pendingStep('hv-isolation-test:step-2')).toBeUndefined();
    });

    it('never speaks a step from a background job, and acks it as blocked', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const store = new InMemoryConfirmationStore();
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), hookWith(store));
        injector.track(JOB_ID);
        jobs.emit(
            JOB_ID,
            event(1, 'measure', 'Step 2 of 3. Disconnect the orange HV cables.', {
                ...HV_STEP,
                origin: 'background-job',
            }),
        );
        await flush();
        expect(calls).toHaveLength(1);
        expect(calls[0].method).toBe('addSilentContext');
        expect(calls[0].text).toContain('blocked by the safety hook');
        expect(calls.map((call) => call.method)).not.toContain('speakAtIdle');
        expect(jobs.acks).toEqual([1]); // blocked, not lost: it must not replay
        expect(jobs.subscribed(JOB_ID)).toBe(false);
    });

    it('speaks a routine scripted step at the next idle gap', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const store = new InMemoryConfirmationStore();
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), hookWith(store));
        injector.track(JOB_ID);
        jobs.emit(
            JOB_ID,
            event(1, 'measure', 'Step 1 of 2. Measure the resistance across the coil terminals.', {
                stepId: 'coil-test-p0300:step-1',
                testId: 'coil-test-p0300',
                instruction: 'measure the resistance across the coil terminals',
                safetyClass: 'routine',
                hazards: [],
                vin: VIN,
                origin: 'live-session',
            }),
        );
        await flush();
        expect(calls).toEqual([
            { method: 'speakAtIdle', text: 'Step 1 of 2. Measure the resistance across the coil terminals.' },
        ]);
        expect(jobs.acks).toEqual([1]);
    });

    it('fails closed when the hook throws: the step is never spoken', async () => {
        const { session, calls } = fakeTalkerSession();
        const jobs = fakeJobSource();
        const throwingHook: PreActionHook = {
            checkStep: async () => {
                throw new Error('hook down');
            },
        };
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), throwingHook);
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'measure', 'Step 2 of 3. Disconnect the orange HV cables.', HV_STEP));
        await flush();
        expect(calls.map((call) => call.method)).not.toContain('speakAtIdle');
        expect(jobs.acks).toEqual([1]);
    });

    it('re-queues a confirmation request talked over by the user', async () => {
        const { session, calls } = fakeTalkerSession(['interrupted', 'delivered']);
        const jobs = fakeJobSource();
        const store = new InMemoryConfirmationStore();
        const injector = new ResultInjector(jobs.source, session, fakeLogger(), hookWith(store));
        injector.track(JOB_ID);
        jobs.emit(JOB_ID, event(1, 'measure', 'Step 2 of 3. Disconnect the orange HV cables.', HV_STEP));
        await flush();
        expect(calls.filter((call) => call.method === 'speakAtIdle')).toHaveLength(2);
        expect(calls[calls.length - 1].method).toBe('addSilentContext');
        expect(jobs.acks).toEqual([]);
    });
});
