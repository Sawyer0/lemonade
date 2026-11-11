import { v4 as uuidv4 } from 'uuid';
import { CaseRunQueue, CaseRunRegistry, type CaseEvidence } from '@lemonade/core';

/**
 * Per-case run coordination (LM-17). One coordinator per process: it owns one
 * CaseRunQueue per case plus the single-active-run registry, and joins a
 * second caller for the same case onto the run that is already active
 * instead of starting a competing one. The caller's evidence is queued
 * first, so the active run folds it in at its next checkpoint.
 *
 * The coordinator holds no I/O: evidence, queues and run slots are
 * in-memory. Persistence (snapshot restore, case-version commit) lives in
 * MechanicReasoningService and the case repository.
 */
export class CaseRunCoordinator {
    private readonly queues = new Map<string, CaseRunQueue>();
    private readonly registry = new CaseRunRegistry();
    private readonly activeRuns = new Map<string, Promise<unknown>>();

    /** Queues one piece of evidence for the case. Returns the pending count. */
    submitEvidence(caseId: string, evidence: CaseEvidence): number {
        return this.queueFor(caseId).enqueue(evidence);
    }

    /** Evidence for the tech's own follow-up question or answer, as a queue item. */
    evidenceFromQuery(userQuery: string): CaseEvidence {
        return {
            id: uuidv4(),
            kind: 'answer',
            summary: userQuery,
            receivedAt: new Date(),
        };
    }

    /** Checkpoint drain for the case's active run: every pending item, in arrival order. */
    drainAtCheckpoint(caseId: string): CaseEvidence[] {
        return this.queueFor(caseId).drainAtCheckpoint();
    }

    pendingCount(caseId: string): number {
        return this.queueFor(caseId).pendingCount();
    }

    activeRunId(caseId: string): string | null {
        return this.registry.activeRunId(caseId);
    }

    /**
     * Runs `task` as the case's single active run. When a run is already
     * active for the case, the caller's task never starts: the active run's
     * promise is returned instead, so both callers observe one run. The
     * slot is released when the run settles, even when it fails.
     */
    async execute<T>(caseId: string, runId: string, task: () => Promise<T>): Promise<T> {
        const active = this.activeRuns.get(caseId);
        if (active) {
            return active as Promise<T>;
        }
        if (!this.registry.acquire(caseId, runId)) {
            const raced = this.activeRuns.get(caseId);
            if (raced) {
                return raced as Promise<T>;
            }
            throw new Error(`Case ${caseId} already has an active run`);
        }
        const promise = task().finally(() => {
            this.activeRuns.delete(caseId);
            this.registry.release(caseId, runId);
        });
        this.activeRuns.set(caseId, promise);
        return promise;
    }

    private queueFor(caseId: string): CaseRunQueue {
        let queue = this.queues.get(caseId);
        if (!queue) {
            queue = new CaseRunQueue();
            this.queues.set(caseId, queue);
        }
        return queue;
    }
}
