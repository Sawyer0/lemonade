import { describe, expect, it, vi } from 'vitest';
import { JobClient, JobServiceError } from '../src/jobs/JobClient';

const JOB_ID = '00000000-0000-0000-0000-000000000001';
const CASE_ID = '00000000-0000-0000-0000-000000000002';

function jobJson(overrides: Record<string, unknown> = {}) {
    return {
        id: JOB_ID,
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

function eventJson(seq: number, kind: string, text: string) {
    return { jobId: JOB_ID, seq, kind, text, createdAt: '2026-11-11T00:00:00.000Z' };
}

/** A fetch fake that answers from a handler, recording every call. */
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    return vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('JobClient', () => {
    it('submits a job and returns the job id', async () => {
        const fetchImpl = fakeFetch((url, init) => {
            expect(url).toBe('https://jobs.test/api/jobs');
            expect(init?.method).toBe('POST');
            expect(init?.headers).toMatchObject({ 'x-api-key': 'key-1' });
            expect(JSON.parse(String(init?.body))).toMatchObject({ question: 'Why does it squeal?' });
            return jsonResponse({ jobId: JOB_ID, status: 'pending' }, 202);
        });
        const client = new JobClient('https://jobs.test/', 'key-1', fetchImpl as unknown as typeof fetch);
        await expect(client.submitJob({ question: 'Why does it squeal?', sessionId: 's', userId: 'u' })).resolves.toEqual({
            jobId: JOB_ID,
            status: 'pending',
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('omits the api key header when no key is configured', async () => {
        const fetchImpl = fakeFetch(() => jsonResponse({ jobId: JOB_ID, status: 'pending' }, 202));
        const client = new JobClient('https://jobs.test', undefined, fetchImpl as unknown as typeof fetch);
        await client.submitJob({ question: 'q', sessionId: 's', userId: 'u' });
        expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('x-api-key');
    });

    it('fails fast when the service does not answer in time', async () => {
        const fetchImpl = fakeFetch((_url, init) => {
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () =>
                    reject(new DOMException('The operation timed out.', 'TimeoutError')),
                );
            });
        });
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const started = Date.now();
        await expect(client.submitJob({ question: 'q', sessionId: 's', userId: 'u' })).rejects.toBeInstanceOf(
            JobServiceError,
        );
        expect(Date.now() - started).toBeLessThan(1000);
    });

    it('reports a non-2xx with its status', async () => {
        const fetchImpl = fakeFetch(() => new Response('overloaded', { status: 503 }));
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const error = await client.submitJob({ question: 'q', sessionId: 's', userId: 'u' }).catch((e) => e);
        expect(error).toBeInstanceOf(JobServiceError);
        expect((error as JobServiceError).status).toBe(503);
        expect((error as Error).message).toContain('503');
    });

    it('gets a job with its events, cancels one, and acks a delivered seq', async () => {
        const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
        const fetchImpl = fakeFetch((url, init) => {
            seen.push({ url, method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
            if (url.endsWith('/ack')) return jsonResponse({ ok: true });
            if (init?.method === 'DELETE') return new Response(null, { status: 204 });
            return jsonResponse({ job: jobJson(), events: [eventJson(1, 'progress', 'Working on it.')] });
        });
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const detail = await client.getJob(JOB_ID);
        expect(detail.job.id).toBe(JOB_ID);
        expect(detail.events).toHaveLength(1);
        await client.cancelJob(JOB_ID);
        await client.acknowledge(JOB_ID, 2);
        expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
            `GET https://jobs.test/api/jobs/${JOB_ID}`,
            `DELETE https://jobs.test/api/jobs/${JOB_ID}`,
            `POST https://jobs.test/api/jobs/${JOB_ID}/ack`,
        ]);
        expect(seen[2].body).toEqual({ seq: 2 });
    });

    it('lists jobs for a case', async () => {
        const fetchImpl = fakeFetch((url) => {
            expect(url).toBe(`https://jobs.test/api/jobs?caseId=${CASE_ID}`);
            return jsonResponse([jobJson(), jobJson({ id: '00000000-0000-0000-0000-000000000003', status: 'succeeded' })]);
        });
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const jobs = await client.listJobsForCase(CASE_ID);
        expect(jobs).toHaveLength(2);
        expect(jobs[1].status).toBe('succeeded');
    });

    it('streams SSE events in order, skips malformed lines, and stops on unsubscribe', async () => {
        const encoder = new TextEncoder();
        const chunks = [
            `data: ${JSON.stringify(eventJson(1, 'progress', 'Started.'))}\n\n`,
            `data: ${JSON.stringify(eventJson(2, 'finding', 'Replace the sensor.'))}\n`,
            'data: not-json\n\n',
            `data: ${JSON.stringify(eventJson(3, 'finding', 'Second.'))}\n\n`,
        ];
        // Split the second event across two chunks to prove buffering works.
        const splitAt = 12;
        const second = chunks[1];
        chunks.splice(1, 1, second.slice(0, splitAt), second.slice(splitAt));

        let aborted = false;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            },
        });
        const fetchImpl = fakeFetch((_url, init) => {
            init?.signal?.addEventListener('abort', () => {
                aborted = true;
            });
            return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
        });
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const received: Array<{ seq: number; text: string }> = [];
        const errors: Error[] = [];
        const unsubscribe = client.subscribe(JOB_ID, {
            onEvent: (event) => received.push({ seq: event.seq, text: event.text }),
            onError: (error) => errors.push(error),
        });
        await vi.waitFor(() => expect(received).toHaveLength(3));
        expect(received.map((event) => event.seq)).toEqual([1, 2, 3]);
        expect(errors).toEqual([]);
        unsubscribe();
        expect(aborted).toBe(true);
    });

    it('reports a stream failure once via onError', async () => {
        const fetchImpl = fakeFetch(() => Promise.reject(new Error('connection reset')));
        const client = new JobClient('https://jobs.test', 'key-1', fetchImpl as unknown as typeof fetch);
        const errors: Error[] = [];
        client.subscribe(JOB_ID, { onEvent: () => undefined, onError: (error) => errors.push(error) });
        await vi.waitFor(() => expect(errors).toHaveLength(1));
        expect(errors[0].message).toBe('connection reset');
    });
});
