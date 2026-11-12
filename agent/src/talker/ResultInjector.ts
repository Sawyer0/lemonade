import {
    TERMINAL_JOB_EVENT_KINDS,
    buildConfirmationPrompt,
    jobStepOrigin,
    jobStepToPhysicalStep,
    type DiagnosticJob,
    type DiagnosticJobEvent,
    type ILogger,
    type PhysicalStep,
    type PreActionDecision,
    type PreActionHook,
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

/** Delivery acks are retried this many times, then only logged. */
const ACK_ATTEMPTS = 3;

/** Held steps are keyed by job + step: two jobs can hold the same step id. */
function pendingStepKey(jobId: string, stepId: string): string {
    return `${jobId}::${stepId}`;
}

/** Base delay between ack retries; doubled per attempt. */
const ACK_RETRY_DELAY_MS = 200;

interface TrackedJob {
    unsubscribe: () => void;
    /** Serialises deliveries for one job, so events land in seq order. */
    chain: Promise<void>;
    deliveredSeq: number;
}

/** A scripted step held for the tech's spoken confirmation. */
export interface PendingStep {
    step: PhysicalStep;
    decision: PreActionDecision;
    jobId: string;
    event: DiagnosticJobEvent;
    state: TrackedJob;
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
 * events at or below the acked seq are skipped, so a result that landed
 * while the talker was away is still delivered — at least once, never lost.
 * The ack is best-effort (retried a few times, then only logged), so a
 * failed ack can replay a result that was already spoken: delivery is
 * at-least-once, not exactly-once.
 *
 * LM-20: a `measure` event carrying a scripted step passes the pre-action
 * hook before it is spoken. A denied step is never spoken. A risky step is
 * held: the injector speaks a confirmation request instead, and the step
 * itself is spoken only after the tech confirms out loud and the
 * confirmation is logged (see StepConfirmationTool). A `measure` event
 * without step metadata is unstructured reasoner text, not a scripted
 * step, and passes through as before — it has no step id or VIN for a
 * confirmation to bind to.
 */
export class ResultInjector {
    private readonly tracked = new Map<string, TrackedJob>();
    private readonly pendingSteps = new Map<string, PendingStep>();
    private stopped = false;

    constructor(
        private readonly jobs: JobEventSource,
        private readonly session: TalkerSession,
        private readonly logger: ILogger,
        /** LM-20: when absent, structured steps pass through ungated (tests, legacy paths). */
        private readonly preActionHook?: PreActionHook,
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

    /**
     * A step held for spoken confirmation, for the confirmation tool to
     * check. With a job id, the exact held step resolves. Without one,
     * only an unambiguous single match resolves: two jobs holding the
     * same step id must never release each other's step.
     */
    pendingStep(stepId: string, jobId?: string): PendingStep | undefined {
        if (jobId !== undefined) return this.pendingSteps.get(pendingStepKey(jobId, stepId));
        const matches = [...this.pendingSteps.values()].filter((pending) => pending.step.stepId === stepId);
        return matches.length === 1 ? matches[0] : undefined;
    }

    /**
     * Speaks a held step after its confirmation is logged. Returns false
     * when there is no such pending step, or the step could not be spoken:
     * the step stays pending, unacked, so a resume replays the event and
     * the hook re-evaluates it (the logged confirmation then allows it).
     */
    async releasePendingStep(stepId: string, jobId?: string): Promise<boolean> {
        const pending = this.pendingStep(stepId, jobId);
        if (!pending || this.stopped) return false;
        const delivered = await this.deliverAtIdle(pending.jobId, pending.event.text);
        if (!delivered) {
            this.logger.warn('Held step delivery abandoned after retries, step stays pending', {
                jobId: pending.jobId,
                stepId,
                seq: pending.event.seq,
            });
            return false;
        }
        this.pendingSteps.delete(pendingStepKey(pending.jobId, pending.step.stepId));
        pending.state.deliveredSeq = pending.event.seq;
        this.acknowledge(pending.jobId, pending.event.seq);
        if (TERMINAL_JOB_EVENT_KINDS.has(pending.event.kind)) this.untrack(pending.jobId);
        return true;
    }

    /** Stops every subscription. Call when the session ends. */
    stop(): void {
        this.stopped = true;
        for (const state of this.tracked.values()) state.unsubscribe();
        this.tracked.clear();
        this.pendingSteps.clear();
    }

    private async deliver(jobId: string, event: DiagnosticJobEvent, state: TrackedJob): Promise<void> {
        if (event.seq <= state.deliveredSeq) {
            // Already delivered, so nothing to say again — but a terminal
            // event still ends the job. Without this, a resume replay of a
            // finished job would leave the subscription open forever: the
            // stream closes immediately (nothing more to emit), the client
            // resubscribes, and the replay is skipped again, endlessly.
            if (TERMINAL_JOB_EVENT_KINDS.has(event.kind)) this.untrack(jobId);
            return;
        }
        switch (event.kind) {
            case 'progress':
            case 'snapshot':
                await this.session.addSilentContext(event.text);
                break;
            case 'finding': {
                const delivered = await this.deliverAtIdle(jobId, event.text);
                if (!delivered) {
                    this.logger.warn('Finding delivery abandoned after retries', { jobId, seq: event.seq });
                    return;
                }
                break;
            }
            case 'measure': {
                const gated = await this.deliverMeasure(jobId, event, state);
                if (!gated) return;
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
     * Delivers a `measure` event. Returns false when the event is held or
     * abandoned: it stays unacked, so a resume replays it.
     *
     * With step metadata and a hook, the pre-action hook decides: deny
     * never speaks the step; ask holds it for spoken confirmation; allow
     * speaks it at the next idle gap. Without metadata, or without a hook,
     * the text is spoken as before.
     */
    private async deliverMeasure(jobId: string, event: DiagnosticJobEvent, state: TrackedJob): Promise<boolean> {
        if (!event.step || !this.preActionHook) {
            return this.deliverAtIdle(jobId, event.text);
        }
        const step = jobStepToPhysicalStep(event.step);
        const origin = jobStepOrigin(event.step);
        let decision: PreActionDecision;
        try {
            decision = await this.preActionHook.checkStep(step, origin);
        } catch (error) {
            // The hook failed: fail closed. The step is never spoken.
            this.logger.error('Pre-action hook failed, step denied', error, { jobId, stepId: step.stepId });
            await this.session.addSilentContext(
                `[Diagnostic update. Context only, do not answer this directly.]\n` +
                    `A physical step was blocked because the safety check failed: step ${step.stepId}. ` +
                    `Tell the technician the step is blocked, without describing how to perform it.`,
            );
            return true;
        }
        if (decision.verdict === 'deny') {
            this.logger.warn('Pre-action hook denied a step, never spoken', {
                jobId,
                stepId: step.stepId,
                reason: decision.reason,
            });
            await this.session.addSilentContext(
                `[Diagnostic update. Context only, do not answer this directly.]\n` +
                    `A physical step was blocked by the safety hook and must never be spoken or performed: ` +
                    `step ${step.stepId}. Reason: ${decision.reason}. ` +
                    `Tell the technician the step is blocked and why, without describing how to perform it.`,
            );
            return true;
        }
        if (decision.verdict === 'ask') {
            this.pendingSteps.set(pendingStepKey(jobId, step.stepId), { step, decision, jobId, event, state });
            const prompt = buildConfirmationPrompt(step, decision);
            const delivered = await this.deliverAtIdle(jobId, prompt);
            if (!delivered) {
                this.logger.warn('Confirmation request abandoned after retries, step stays pending', {
                    jobId,
                    stepId: step.stepId,
                    seq: event.seq,
                });
                return false;
            }
            await this.session.addSilentContext(
                `[Diagnostic update. Context only, do not answer this directly.]\n` +
                    `A physical step is held for spoken confirmation and must NOT be spoken yet: ` +
                    `step ${step.stepId}: ${step.instruction}. ${decision.reason} ` +
                    `When the technician says confirmed, call confirm_physical_step with step_id "${step.stepId}" and job_id "${jobId}". ` +
                    `Do not describe the step or tell the technician to start it until the confirmation is recorded.`,
            );
            // Held, not delivered: no ack, no untrack. A resume replays the
            // event and the hook re-evaluates it — with the logged
            // confirmation on file, it is then allowed.
            return false;
        }
        return this.deliverAtIdle(jobId, event.text);
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

    /**
     * Confirms delivery of `seq`. Best-effort: retried a few times so a
     * transient failure does not replay a finding that was already spoken,
     * then only logged — a failed ack risks a duplicate on resume, never a
     * lost result. Fire-and-forget: delivery never waits on the ack.
     */
    private acknowledge(jobId: string, seq: number): void {
        void this.acknowledgeWithRetry(jobId, seq);
    }

    private async acknowledgeWithRetry(jobId: string, seq: number): Promise<void> {
        for (let attempt = 1; attempt <= ACK_ATTEMPTS; attempt += 1) {
            try {
                await this.jobs.acknowledge(jobId, seq);
                return;
            } catch (error) {
                if (attempt === ACK_ATTEMPTS) {
                    this.logger.warn('Failed to acknowledge job event delivery', {
                        jobId,
                        seq,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, ACK_RETRY_DELAY_MS * attempt));
            }
        }
    }

    private untrack(jobId: string): void {
        const state = this.tracked.get(jobId);
        if (!state) return;
        state.unsubscribe();
        this.tracked.delete(jobId);
    }
}
