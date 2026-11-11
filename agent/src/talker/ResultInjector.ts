import {
    TERMINAL_JOB_EVENT_KINDS,
    type DiagnosticJob,
    type DiagnosticJobEvent,
    type ILogger,
} from '@lemonade/core';
import type { JobEventHandlers } from '../jobs/JobClient';
import type { TalkerSession } from './TalkerSession';

/** The job-service calls the injector needs: subscribe, resume, acknowledge. */
export interface JobEventSource {
    subscribe(jobId: string, handlers: JobEventHandlers): () => void;
    listJobsForCase(caseId: string): Promise<DiagnosticJob[]>;
    acknowledge(jobId: string, seq: number): Promise<void>;
}

/** Times a finding is re-spoken at the next idle gap after the user talks over it. */
const MAX_FINDING_ATTEMPTS = 3;

interface TrackedJob {
    unsubscribe: () => void;
    /** Serialises deliveries for one job, so events land in seq order. */
    chain: Promise<void>;
    deliveredSeq: number;
}

/**
 * Maps diagnostic job events onto the talker session (LM-14).
 *
 * - progress / snapshot → silent context, never spoken.
 * - finding / measure → spoken at the next idle gap; if the user talks
 *   over the delivery, it is re-queued, never dropped, and never cancels
 *   the job.
 * - safety_stop → interrupts mid-sentence, then speaks uninterruptibly.
 * - failed / cancelled → silent context, so the talker stops waiting.
 *
 * Delivered events are acked to the job service. On resume (a reconnect),
 * events at or below the acked seq are skipped, so a result is delivered
 * exactly once even when the job finished while the talker was away.
 */
export class ResultInjector {
    private readonly tracked = new Map<string, TrackedJob>();
    private stopped = false;

    constructor(
        private readonly jobs: JobEventSource,
        private readonly session: TalkerSession,
        private readonly logger: ILogger,
    ) {}

    /** Starts delivering a job's events. Safe to call twice for one job. */
    track(jobId: string, ackedSeq = 0): void {
        if (this.stopped || this.tracked.has(jobId)) return;
        const state: TrackedJob = { unsubscribe: () => undefined, chain: Promise.resolve(), deliveredSeq: ackedSeq };
        state.unsubscribe = this.jobs.subscribe(jobId, {
            onEvent: (event) => {
                state.chain = state.chain
                    .then(() => this.deliver(jobId, event, state))
                    .catch((error: unknown) => {
                        this.logger.error('Failed to deliver job event', error, { jobId, seq: event.seq });
                    });
            },
            onError: (error) => {
                this.logger.error('Job event stream failed', error, { jobId });
            },
        });
        this.tracked.set(jobId, state);
    }

    /** Re-subscribes to a case's jobs after a (re)connect. Undelivered results replay from the service. */
    async resumeForCase(caseId: string): Promise<void> {
        if (this.stopped) return;
        let jobs: DiagnosticJob[];
        try {
            jobs = await this.jobs.listJobsForCase(caseId);
        } catch (error) {
            this.logger.error('Failed to list jobs for case', error, { caseId });
            return;
        }
        for (const job of jobs) this.track(job.id, job.ackedSeq);
    }

    /** Stops every subscription. Call when the session ends. */
    stop(): void {
        this.stopped = true;
        for (const state of this.tracked.values()) state.unsubscribe();
        this.tracked.clear();
    }

    private async deliver(jobId: string, event: DiagnosticJobEvent, state: TrackedJob): Promise<void> {
        if (event.seq <= state.deliveredSeq) return;
        switch (event.kind) {
            case 'progress':
            case 'snapshot':
                await this.session.addSilentContext(event.text);
                break;
            case 'finding':
            case 'measure': {
                const delivered = await this.deliverAtIdle(jobId, event.text);
                if (!delivered) {
                    this.logger.warn('Finding delivery abandoned after retries', { jobId, seq: event.seq });
                    return;
                }
                break;
            }
            case 'safety_stop':
                await this.session.interruptAndSpeak(event.text);
                break;
            case 'failed':
            case 'cancelled':
                await this.session.addSilentContext(`Diagnostic job ${jobId} ${event.kind}: ${event.text}`);
                break;
        }
        state.deliveredSeq = event.seq;
        this.acknowledge(jobId, event.seq);
        if (TERMINAL_JOB_EVENT_KINDS.has(event.kind)) this.untrack(jobId);
    }

    /**
     * Speaks a finding at the next idle gap. Talking over the agent cuts
     * the speech but never cancels the job: the finding is re-queued for
     * the next gap, up to MAX_FINDING_ATTEMPTS times.
     */
    private async deliverAtIdle(jobId: string, text: string): Promise<boolean> {
        for (let attempt = 1; attempt <= MAX_FINDING_ATTEMPTS; attempt += 1) {
            const outcome = await this.session.speakAtIdle(text);
            if (outcome === 'delivered') return true;
            this.logger.info('Finding delivery interrupted, re-queueing at the next idle gap', {
                jobId,
                attempt,
            });
        }
        return false;
    }

    private acknowledge(jobId: string, seq: number): void {
        this.jobs.acknowledge(jobId, seq).catch((error: unknown) => {
            this.logger.warn('Failed to acknowledge job event delivery', {
                jobId,
                seq,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }

    private untrack(jobId: string): void {
        const state = this.tracked.get(jobId);
        if (!state) return;
        state.unsubscribe();
        this.tracked.delete(jobId);
    }
}
