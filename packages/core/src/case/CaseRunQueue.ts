import { z } from 'zod';

// --- Case evidence ---
// One item of new information that arrived while a run was in progress: a
// sensor reading, a captured frame, or the tech's answer to a question. The
// evidence carries no payload bytes (frames live in object storage; the
// ledger stores their hash and reference) — only a short summary the
// reasoner can fold into its next model call.
export const CaseEvidenceKindSchema = z.enum(['reading', 'frame', 'answer']);
export type CaseEvidenceKind = z.infer<typeof CaseEvidenceKindSchema>;

export const CaseEvidenceSchema = z.object({
    id: z.string().min(1),
    kind: CaseEvidenceKindSchema,
    summary: z.string().min(1),
    receivedAt: z.date(),
});
export type CaseEvidence = z.infer<typeof CaseEvidenceSchema>;

/**
 * Per-case run queue (LM-17). One queue per case: new evidence is queued and
 * enters the run only at checkpoints — before each model call and between
 * sequential tools. A checkpoint drains the whole pending batch at once, so
 * two pieces of evidence that arrived mid-run are seen by one run together,
 * never by two competing runs.
 *
 * This class is pure: it holds no I/O, no timers, and no case state beyond
 * its own pending list. The caller owns the checkpoint loop (see
 * CaseRunCoordinator in infrastructure); the run's write guard is
 * PostgresCaseRepository.advanceCaseVersion, not a helper here.
 *
 * Sequential tool-call steering is future work, not a method here: the
 * machine's tools are XState-invoked actors with no planned call list to
 * steer, so a skip/continue planner would have no production caller.
 */
export class CaseRunQueue {
    private readonly pending: CaseEvidence[] = [];

    /** Queues one piece of evidence, in arrival order. Returns the pending count. */
    enqueue(evidence: CaseEvidence): number {
        const parsed = CaseEvidenceSchema.parse(evidence);
        this.pending.push(parsed);
        return this.pending.length;
    }

    pendingCount(): number {
        return this.pending.length;
    }

    hasPending(): boolean {
        return this.pending.length > 0;
    }

    /**
     * Checkpoint drain: takes every pending item in arrival order and clears
     * the queue. Call this at a checkpoint — before a model call, between
     * sequential tools — and fold the returned batch into the run. Evidence
     * that arrives while the batch is being processed waits for the next
     * checkpoint; it is never dropped.
     */
    drainAtCheckpoint(): CaseEvidence[] {
        return this.pending.splice(0, this.pending.length);
    }
}

/**
 * One active reasoner run per case. A second run for the same case must not
 * start while one is active: its evidence joins the active run's queue
 * instead (see CaseRunCoordinator). A run releases only its own slot, so a
 * late release from a finished run can never evict the run that followed it.
 */
export class CaseRunRegistry {
    private readonly activeRuns = new Map<string, string>();

    /** Claims the case's run slot for `runId`. False when another run holds it. */
    acquire(caseId: string, runId: string): boolean {
        if (this.activeRuns.has(caseId)) {
            return false;
        }
        this.activeRuns.set(caseId, runId);
        return true;
    }

    /** Releases the slot, but only when `runId` is the run that holds it. */
    release(caseId: string, runId: string): void {
        if (this.activeRuns.get(caseId) === runId) {
            this.activeRuns.delete(caseId);
        }
    }

    activeRunId(caseId: string): string | null {
        return this.activeRuns.get(caseId) ?? null;
    }
}
