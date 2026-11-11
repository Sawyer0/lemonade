import {
    AcknowledgeDiagnosticJobRequestSchema,
    CreateDiagnosticJobRequestSchema,
    DiagnosticJobDetailSchema,
    DiagnosticJobEventSchema,
    DiagnosticJobSchema,
    JOB_SUBMIT_TIMEOUT_MS,
    SubmitDiagnosticJobResponseSchema,
    type CreateDiagnosticJobInput,
    type DiagnosticJob,
    type DiagnosticJobDetail,
    type DiagnosticJobEvent,
    type SubmitDiagnosticJobResponse,
} from '@lemonade/core';

/** Non-latency-critical job calls (status, cancel, list, ack) may take this long. */
const JOB_REQUEST_TIMEOUT_MS = 10_000;

/** First delay before resubscribing after a stream failure; doubled per attempt. */
const SSE_RETRY_INITIAL_MS = 500;

/** Longest delay between SSE resubscribes. */
const SSE_RETRY_MAX_MS = 30_000;

/** The job service answered, but not with a 2xx, or not in time, or not as expected. */
export class JobServiceError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
        this.name = 'JobServiceError';
    }
}

export interface JobEventHandlers {
    onEvent(event: DiagnosticJobEvent): void;
    onError(error: Error): void;
}

type FetchImpl = typeof fetch;

/**
 * HTTP client for the Lemonade-owned diagnostic job service (Next.js
 * `/api/jobs`). Submit returns a job id fast — the call is bounded by
 * JOB_SUBMIT_TIMEOUT_MS so `consult_diagnostician` stays inside its
 * 300 ms budget — and the reasoner runs server-side. `subscribe` streams
 * job events (SSE); the endpoint replays stored events first, so a fresh
 * subscribe after a reconnect re-delivers anything missed.
 */
export class JobClient {
    private readonly baseUrl: string;
    private readonly apiKey: string | undefined;
    private readonly fetchImpl: FetchImpl;

    constructor(baseUrl: string, apiKey: string | undefined, fetchImpl: FetchImpl = globalThis.fetch) {
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.apiKey = apiKey;
        this.fetchImpl = fetchImpl;
    }

    async submitJob(request: CreateDiagnosticJobInput): Promise<SubmitDiagnosticJobResponse> {
        const parsed = CreateDiagnosticJobRequestSchema.parse(request);
        const response = await this.call('POST', '/api/jobs', parsed, JOB_SUBMIT_TIMEOUT_MS);
        return this.parse(response, SubmitDiagnosticJobResponseSchema, 'submit job');
    }

    async getJob(jobId: string): Promise<DiagnosticJobDetail> {
        const response = await this.call(
            'GET',
            `/api/jobs/${encodeURIComponent(jobId)}`,
            undefined,
            JOB_REQUEST_TIMEOUT_MS,
        );
        return this.parse(response, DiagnosticJobDetailSchema, 'get job');
    }

    /** Jobs for a case, newest first. Used to resume jobs after a reconnect. */
    async listJobsForCase(caseId: string): Promise<DiagnosticJob[]> {
        const response = await this.call(
            'GET',
            `/api/jobs?caseId=${encodeURIComponent(caseId)}`,
            undefined,
            JOB_REQUEST_TIMEOUT_MS,
        );
        const parsed = await this.json(response, 'list jobs');
        const jobs = Array.isArray(parsed)
            ? parsed
            : typeof parsed === 'object' && parsed !== null && 'jobs' in parsed
              ? (parsed as { jobs: unknown }).jobs
              : undefined;
        if (!Array.isArray(jobs))
            throw new JobServiceError('Job service returned an unexpected response for list jobs');
        return jobs.map((job: unknown) => {
            const result = DiagnosticJobSchema.safeParse(job);
            if (!result.success) throw new JobServiceError('Job service returned an unexpected response for list jobs');
            return result.data;
        });
    }

    async cancelJob(jobId: string): Promise<void> {
        await this.call('DELETE', `/api/jobs/${encodeURIComponent(jobId)}`, undefined, JOB_REQUEST_TIMEOUT_MS);
    }

    /** Confirms the talker delivered every event up to `seq`. Best-effort: a failed ack risks a duplicate on resume, never a lost result. */
    async acknowledge(jobId: string, seq: number): Promise<void> {
        await this.call(
            'POST',
            `/api/jobs/${encodeURIComponent(jobId)}/ack`,
            AcknowledgeDiagnosticJobRequestSchema.parse({ seq }),
            JOB_REQUEST_TIMEOUT_MS,
        );
    }

    /**
     * Streams a job's events until the caller unsubscribes. Stored events
     * replay first, then live ones. A stream failure is reported via
     * `onError` and the subscription resubscribes with backoff (500 ms,
     * doubling to 30 s) until unsubscribed; a clean stream end resubscribes
     * the same way, so a transient drop never silently ends delivery.
     * Replays are safe: the injector skips events at or below the acked
     * seq. Malformed lines are skipped.
     */
    subscribe(jobId: string, handlers: JobEventHandlers): () => void {
        const controller = new AbortController();
        void this.streamEvents(jobId, controller.signal, handlers);
        return () => controller.abort();
    }

    private async streamEvents(jobId: string, signal: AbortSignal, handlers: JobEventHandlers): Promise<void> {
        let delayMs = SSE_RETRY_INITIAL_MS;
        for (;;) {
            try {
                await this.streamOnce(jobId, signal, handlers);
            } catch (error) {
                if (signal.aborted) return;
                handlers.onError(error instanceof Error ? error : new JobServiceError('Job event stream failed'));
            }
            if (signal.aborted) return;
            if (!(await this.sleep(delayMs, signal))) return;
            delayMs = Math.min(delayMs * 2, SSE_RETRY_MAX_MS);
        }
    }

    private async streamOnce(jobId: string, signal: AbortSignal, handlers: JobEventHandlers): Promise<void> {
        const response = await this.fetchImpl(`${this.baseUrl}/api/jobs/${encodeURIComponent(jobId)}/events`, {
            method: 'GET',
            headers: this.headers(),
            signal,
        });
        if (!response.ok || !response.body) {
            throw new JobServiceError(`Job service returned ${response.status} for job events`, response.status);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) this.parseEventLine(line, handlers.onEvent);
        }
        buffer += decoder.decode();
        for (const line of buffer.split('\n')) this.parseEventLine(line, handlers.onEvent);
    }

    /** Resolves true after `ms`, or false if `signal` aborts first. */
    private sleep(ms: number, signal: AbortSignal): Promise<boolean> {
        if (signal.aborted) return Promise.resolve(false);
        return new Promise((resolve) => {
            const onAbort = () => {
                clearTimeout(timer);
                resolve(false);
            };
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', onAbort);
                resolve(true);
            }, ms);
            signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    private parseEventLine(line: string, onEvent: (event: DiagnosticJobEvent) => void): void {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) return;
        try {
            const parsed = DiagnosticJobEventSchema.safeParse(JSON.parse(trimmed.slice('data:'.length).trim()));
            if (parsed.success) onEvent(parsed.data);
        } catch {
            // A malformed line must not kill the stream; the next line still counts.
        }
    }

    private async call(method: string, path: string, body: unknown, timeoutMs: number): Promise<Response> {
        let response: Response;
        try {
            response = await this.fetchImpl(`${this.baseUrl}${path}`, {
                method,
                headers: this.headers(),
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'TimeoutError') {
                throw new JobServiceError(`Job service did not answer within ${timeoutMs} ms`);
            }
            if (error instanceof DOMException && error.name === 'AbortError') {
                throw new JobServiceError(`Job service request aborted after ${timeoutMs} ms`);
            }
            throw new JobServiceError(
                `Job service unreachable: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new JobServiceError(
                `Job service returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
                response.status,
            );
        }
        return response;
    }

    private headers(): Record<string, string> {
        const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
        if (this.apiKey) headers['x-api-key'] = this.apiKey;
        return headers;
    }

    private async json(response: Response, action: string): Promise<unknown> {
        try {
            return await response.json();
        } catch {
            throw new JobServiceError(`Job service returned an unexpected response for ${action}`);
        }
    }

    private async parse<T>(
        response: Response,
        schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } },
        action: string,
    ): Promise<T> {
        const result = schema.safeParse(await this.json(response, action));
        if (!result.success) throw new JobServiceError(`Job service returned an unexpected response for ${action}`);
        return result.data;
    }
}
