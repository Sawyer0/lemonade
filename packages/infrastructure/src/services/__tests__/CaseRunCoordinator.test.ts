import { describe, it, expect } from 'vitest';
import { CaseRunCoordinator } from '../CaseRunCoordinator';
import type { CaseEvidence } from '@lemonade/core';

function evidence(id: string, summary: string): CaseEvidence {
    return { id, kind: 'reading', summary, receivedAt: new Date('2026-11-11T10:00:00.000Z') };
}

describe('CaseRunCoordinator', () => {
    it('queues two pieces of evidence for one drain, in arrival order', () => {
        const coordinator = new CaseRunCoordinator();
        expect(coordinator.submitEvidence('case-1', evidence('e1', 'OBD: P0300 misfire'))).toBe(1);
        expect(coordinator.submitEvidence('case-1', evidence('e2', 'Frame: smoke from cylinder 3'))).toBe(2);
        expect(coordinator.pendingCount('case-1')).toBe(2);

        const batch = coordinator.drainAtCheckpoint('case-1');
        expect(batch.map((item) => item.id)).toEqual(['e1', 'e2']);
        expect(coordinator.pendingCount('case-1')).toBe(0);
    });

    it('keeps a separate queue per case', () => {
        const coordinator = new CaseRunCoordinator();
        coordinator.submitEvidence('case-1', evidence('e1', 'first case'));
        coordinator.submitEvidence('case-2', evidence('e2', 'second case'));
        expect(coordinator.drainAtCheckpoint('case-1').map((item) => item.id)).toEqual(['e1']);
        expect(coordinator.drainAtCheckpoint('case-2').map((item) => item.id)).toEqual(['e2']);
    });

    it('joins a second caller onto the active run instead of starting a competing one', async () => {
        const coordinator = new CaseRunCoordinator();
        let taskCalls = 0;
        let release!: (value: string) => void;
        const gate = new Promise<string>((resolve) => {
            release = resolve;
        });
        const task = async (): Promise<string> => {
            taskCalls += 1;
            return gate;
        };

        const first = coordinator.execute('case-1', 'run-a', task);
        const second = coordinator.execute('case-1', 'run-b', task);
        expect(coordinator.activeRunId('case-1')).toBe('run-a');
        expect(taskCalls).toBe(1);

        release('one run');
        await expect(first).resolves.toBe('one run');
        await expect(second).resolves.toBe('one run');
        expect(taskCalls).toBe(1);
        expect(coordinator.activeRunId('case-1')).toBeNull();
    });

    it('lets a new run start after the previous one settles, and releases the slot when a run fails', async () => {
        const coordinator = new CaseRunCoordinator();
        await expect(
            coordinator.execute('case-1', 'run-a', async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(coordinator.activeRunId('case-1')).toBeNull();

        await expect(coordinator.execute('case-1', 'run-b', async () => 'recovered')).resolves.toBe('recovered');
    });

    it('runs different cases concurrently', async () => {
        const coordinator = new CaseRunCoordinator();
        const results = await Promise.all([
            coordinator.execute('case-1', 'run-a', async () => 'first'),
            coordinator.execute('case-2', 'run-b', async () => 'second'),
        ]);
        expect(results).toEqual(['first', 'second']);
    });

    it('builds answer evidence from the tech query', () => {
        const coordinator = new CaseRunCoordinator();
        const item = coordinator.evidenceFromQuery('The noise stops when the belt is off');
        expect(item.kind).toBe('answer');
        expect(item.summary).toBe('The noise stops when the belt is off');
        expect(item.id).toBeTruthy();
    });
});
