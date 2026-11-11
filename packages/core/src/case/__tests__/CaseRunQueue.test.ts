import { describe, it, expect } from 'vitest';
import { CaseRunQueue, CaseRunRegistry, type CaseEvidence } from '../CaseRunQueue';

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
