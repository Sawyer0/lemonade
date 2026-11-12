import {
    diagnosisToJobEvents,
    diagnosticJobSnapshotText,
    type CreateDiagnosticJobRequest,
    type DiagnosticJob,
    type IMechanicReasoningService,
    type ILogger,
    type StepOrigin,
} from '@lemonade/core';
import type { DiagnosticJobStore } from './DiagnosticJobStore';

export interface DiagnosticJobRunnerDeps {
    store: DiagnosticJobStore;
    reasoner: IMechanicReasoningService;
    logger: ILogger;
    /**
     * LM-20: where the job was filed. Only a live talker session can issue
     * a physical step. Defaults to background: a caller must explicitly
     * claim a live session, and a background job's step is rejected.
     */
    origin?: StepOrigin;
}

/**
 * Runs one job's reasoner call in the background (LM-14). The route has
 * already returned the job id, so this never blocks the talker. A result
 * that lands after a cancel is dropped, never spoken.
 */
export async function runDiagnosticJob(
    { store, reasoner, logger, origin = 'background-job' }: DiagnosticJobRunnerDeps,
    job: DiagnosticJob,
    request: CreateDiagnosticJobRequest,
): Promise<void> {
    store.appendEvent(job.id, {
        kind: 'progress',
        text: 'Diagnostician started. Checking the manual, recalls, and similar cases.',
    });
    store.appendEvent(job.id, { kind: 'snapshot', text: diagnosticJobSnapshotText(job) });
    try {
        const state = await reasoner.diagnose({
            userQuery: request.question,
            vehicleContext: request.vehicle,
            sessionId: request.sessionId,
            userId: request.userId,
            caseId: request.caseId,
            localTriage: request.localTriage,
        });
        const current = store.get(job.id);
        if (!current || current.status === 'cancelled') return;
        // LM-20: the reasoner's step is gated on the job's origin here, at
        // emission. A background job's REQUEST_MORE_INFO never becomes a
        // `measure` event (see diagnosisToJobEvents).
        for (const draft of diagnosisToJobEvents(state, origin)) store.appendEvent(job.id, draft);
    } catch (error) {
        const current = store.get(job.id);
        if (!current || current.status === 'cancelled') return;
        logger.error('Diagnostic job failed', error, { jobId: job.id });
        store.appendEvent(job.id, {
            kind: 'failed',
            text: 'The diagnostician could not finish this question. Please ask again or check manually.',
        });
    }
}
