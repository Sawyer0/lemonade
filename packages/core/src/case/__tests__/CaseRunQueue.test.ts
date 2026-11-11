import { describe, it, expect } from 'vitest';
import { AppError } from '../../errors/AppError';
import { ErrorCode } from '../../errors/codes';
import {
    CaseRunQueue,
    CaseRunRegistry,
    SKIPPED_TO_PROCESS_NEW_EVIDENCE,
    assertRunVersionCurrent,
    type CaseEvidence,
    type PlannedToolCall,
} from '../CaseRunQueue';

function evidence(id: string, summary: string, kind: CaseEvidence['kind'] = 'reading'): CaseEvidence {
    return { id, kind, summary, receivedAt: new Date('2026-11-11T10:00:00.000Z') };
}

describe('CaseRunQueue', () => {
    it('queues evidence in arrival order and drains it as one batch at a checkpoint', () => {
        const queue = new CaseRunQueue();
        expect(queue.hasPending()).toBe(false);
        expect(queue.enqueue(evidence('e1', 'OBD: P0300 misfire'))).toBe(1);
        expect(queue.enqueue(evidence('e2', 'Frame: smoke from cylinder 3', 'frame'))).toBe(2);
        expect(queue.pendingCount()).toBe(2);

        const batch = queue.drainAtCheckpoint();
        expect(batch.map((item) => item.id)).toEqual(['e1', 'e2']);
        expect(queue.hasPending()).toBe(false);
        expect(queue.drainAtCheckpoint()).toEqual([]);
    });

    it('rejects evidence that does not match the schema', () => {
        const queue = new CaseRunQueue();
        expect(() => queue.enqueue({ id: '', kind: 'reading', summary: 'x', receivedAt: new Date() })).toThrow();
        expect(() =>
            queue.enqueue({ id: 'e1', kind: 'telepathy', summary: 'x', receivedAt: new Date() } as never),
        ).toThrow();
        expect(queue.pendingCount()).toBe(0);
    });

    it('lets every planned tool call continue when no evidence is pending', () => {
        const queue = new CaseRunQueue();
        const calls: PlannedToolCall[] = [
            { id: 't1', name: 'search', status: 'pending' },
            { id: 't2', name: 'verify', status: 'running' },
        ];
        expect(queue.planToolCalls(calls)).toEqual([
            { id: 't1', name: 'search', outcome: 'continue' },
            { id: 't2', name: 'verify', outcome: 'continue' },
        ]);
    });

    it('skips unstarted tool calls with the exact reason and never kills a running one', () => {
        const queue = new CaseRunQueue();
        queue.enqueue(evidence('e1', 'Tech: the noise stops when the belt is off', 'answer'));
        const calls: PlannedToolCall[] = [
            { id: 't1', name: 'search', status: 'pending' },
            { id: 't2', name: 'verify', status: 'running' },
            { id: 't3', name: 'recall-check', status: 'done' },
        ];
        expect(queue.planToolCalls(calls)).toEqual([
            { id: 't1', name: 'search', outcome: 'skipped', reason: SKIPPED_TO_PROCESS_NEW_EVIDENCE },
            { id: 't2', name: 'verify', outcome: 'continue' },
            { id: 't3', name: 'recall-check', outcome: 'continue' },
        ]);
        // Steering does not consume the evidence: it is still drained at the checkpoint.
        expect(queue.pendingCount()).toBe(1);
        expect(queue.drainAtCheckpoint().map((item) => item.id)).toEqual(['e1']);
    });

    it('keeps evidence that arrives while a checkpoint batch is being processed', () => {
        const queue = new CaseRunQueue();
        queue.enqueue(evidence('e1', 'first reading'));
        const batch = queue.drainAtCheckpoint();
        queue.enqueue(evidence('e2', 'second reading'));
        expect(batch.map((item) => item.id)).toEqual(['e1']);
        expect(queue.drainAtCheckpoint().map((item) => item.id)).toEqual(['e2']);
    });
});

describe('CaseRunRegistry', () => {
    it('allows one active run per case and a second run only after release', () => {
        const registry = new CaseRunRegistry();
        expect(registry.acquire('case-1', 'run-a')).toBe(true);
        expect(registry.acquire('case-1', 'run-b')).toBe(false);
        expect(registry.activeRunId('case-1')).toBe('run-a');
        expect(registry.acquire('case-2', 'run-b')).toBe(true);

        registry.release('case-1', 'run-a');
        expect(registry.activeRunId('case-1')).toBeNull();
        expect(registry.acquire('case-1', 'run-b')).toBe(true);
    });

    it('ignores a release from a run that does not hold the slot', () => {
        const registry = new CaseRunRegistry();
        registry.acquire('case-1', 'run-a');
        registry.release('case-1', 'run-b');
        expect(registry.activeRunId('case-1')).toBe('run-a');
        registry.release('case-1', 'run-a');
        expect(registry.activeRunId('case-1')).toBeNull();
    });
});

describe('assertRunVersionCurrent', () => {
    it('passes when the run read the current version', () => {
        expect(() => assertRunVersionCurrent(3, 3, 'case-1')).not.toThrow();
    });

    it('throws a 409 VERSION_CONFLICT when the case moved on', () => {
        try {
            assertRunVersionCurrent(3, 4, 'case-1');
            expect.unreachable();
        } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe(ErrorCode.VERSION_CONFLICT);
            expect((error as AppError).statusCode).toBe(409);
            expect((error as Error).message).toContain('read version 3, current version 4');
        }
    });

    it('rejects non-integer versions instead of comparing them', () => {
        expect(() => assertRunVersionCurrent(1.5, 1.5, 'case-1')).toThrow(AppError);
    });
});
