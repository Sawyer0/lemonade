import {
    diagnosisToJobEvents,
    diagnosticJobSnapshotText,
    type CreateDiagnosticJobRequest,
    type DiagnosticJob,
    type IMechanicReasoningService,
    type ILogger,
} from '@lemonade/core';
import type { DiagnosticJobStore } from './DiagnosticJobStore';

export interface DiagnosticJobRunnerDeps {
    store: DiagnosticJobStore;
    reasoner: IMechanicReasoningService;
    logger: ILogger;
}

/**
 * Runs one job's reasoner call in the background (LM-14). The route has
 * already returned the job id, so this never blocks the talker. A result
 * that lands after a cancel is dropped, never spoken.
 */
export async function runDiagnosticJob(
    { store, reasoner, logger }: DiagnosticJobRunnerDeps,
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
        for (const draft of diagnosisToJobEvents(state)) store.appendEvent(job.id, draft);
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
