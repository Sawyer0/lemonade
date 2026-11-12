import { randomUUID } from 'node:crypto';
import {
    TERMINAL_JOB_EVENT_KINDS,
    vehicleSummaryText,
    type CreateDiagnosticJobRequest,
    type DiagnosticJob,
    type DiagnosticJobEvent,
    type DiagnosticJobEventDraft,
} from '@lemonade/core';

export type JobEventListener = (event: DiagnosticJobEvent) => void;

/**
 * In-memory store for diagnostic jobs (LM-14). Jobs are short-lived —
 * they exist for one live session — so they live in the app server's
 * memory, keyed by job id, with a per-case index for reconnect resume.
 * A multi-instance deploy would need these in Firestore; a single app
 * instance serves M1.
 */
export class DiagnosticJobStore {
    private readonly jobs = new Map<string, DiagnosticJob>();
    private readonly events = new Map<string, DiagnosticJobEvent[]>();
    private readonly listeners = new Map<string, Set<JobEventListener>>();

    create(request: CreateDiagnosticJobRequest): DiagnosticJob {
        const now = new Date().toISOString();
        const job: DiagnosticJob = {
            id: randomUUID(),
            caseId: request.caseId,
            sessionId: request.sessionId,
            userId: request.userId,
            question: request.question,
            evidenceRefs: request.evidenceRefs,
            vehicleSummary: vehicleSummaryText(request.vehicle),
            status: 'pending',
            ackedSeq: 0,
            createdAt: now,
            updatedAt: now,
        };
        this.jobs.set(job.id, job);
        this.events.set(job.id, []);
        return job;
    }

    get(jobId: string): DiagnosticJob | undefined {
        return this.jobs.get(jobId);
    }

    /** Jobs for a case, newest first. */
    listByCase(caseId: string): DiagnosticJob[] {
        return [...this.jobs.values()]
            .filter((job) => job.caseId === caseId)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    eventsFor(jobId: string): DiagnosticJobEvent[] {
        return [...(this.events.get(jobId) ?? [])];
    }

    /**
     * Appends an event, stamping its per-job seq. A terminal event also
     * closes the job: finding, measure and safety_stop succeed it; failed
     * and cancelled set their status. Returns undefined for an unknown job.
     */
    appendEvent(jobId: string, draft: DiagnosticJobEventDraft): DiagnosticJobEvent | undefined {
        const job = this.jobs.get(jobId);
        const stored = this.events.get(jobId);
        if (!job || !stored) return undefined;
        const event: DiagnosticJobEvent = {
            jobId,
            seq: stored.length + 1,
            kind: draft.kind,
            text: draft.text,
            ...(draft.step ? { step: draft.step } : {}),
            createdAt: new Date().toISOString(),
        };
        stored.push(event);
        if (TERMINAL_JOB_EVENT_KINDS.has(draft.kind)) {
            job.status = draft.kind === 'failed' ? 'failed' : draft.kind === 'cancelled' ? 'cancelled' : 'succeeded';
        } else if (job.status === 'pending') {
            job.status = 'running';
        }
        job.updatedAt = event.createdAt;
        for (const listener of this.listeners.get(jobId) ?? []) listener(event);
        return event;
    }

    /** Cancels a live job. Returns false when the job is unknown or already terminal. */
    cancel(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        if (!job || job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
            return false;
        }
        this.appendEvent(jobId, { kind: 'cancelled', text: 'The job was cancelled.' });
        return true;
    }

    /** Records the highest event seq the talker confirmed delivering. */
    setAckedSeq(jobId: string, seq: number): boolean {
        const job = this.jobs.get(jobId);
        if (!job) return false;
        job.ackedSeq = Math.max(job.ackedSeq, seq);
        return true;
    }

    /** Live fan-out for the SSE endpoint. The returned function unsubscribes. */
    subscribe(jobId: string, listener: JobEventListener): () => void {
        let listeners = this.listeners.get(jobId);
        if (!listeners) {
            listeners = new Set();
            this.listeners.set(jobId, listeners);
        }
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
            if (listeners.size === 0) this.listeners.delete(jobId);
        };
    }
}

/** The store the jobs routes share. Tests construct their own instances. */
export const diagnosticJobStore = new DiagnosticJobStore();
