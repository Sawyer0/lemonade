import { describe, expect, it } from 'vitest';
import { DiagnosticJobStore } from '../DiagnosticJobStore';
import type { CreateDiagnosticJobRequest } from '@lemonade/core';

const CASE_ID = '00000000-0000-0000-0000-000000000001';
const OTHER_CASE_ID = '00000000-0000-0000-0000-000000000002';

function request(overrides: Partial<CreateDiagnosticJobRequest> = {}): CreateDiagnosticJobRequest {
    return {
        question: 'Why does it squeal?',
        evidenceRefs: [],
        caseId: CASE_ID,
        sessionId: 'session-1',
        userId: 'user-1',
        vehicle: { year: 2019, make: 'Honda', model: 'Civic' },
        ...overrides,
    };
}

describe('DiagnosticJobStore', () => {
    it('creates a pending job with a vehicle summary', () => {
        const store = new DiagnosticJobStore();
        const job = store.create(request());
        expect(job.status).toBe('pending');
        expect(job.ackedSeq).toBe(0);
        expect(job.vehicleSummary).toBe('2019 Honda Civic');
        expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(store.eventsFor(job.id)).toEqual([]);
    });

    it('stamps incrementing seqs and moves pending to running on progress', () => {
        const store = new DiagnosticJobStore();
        const job = store.create(request());
        const first = store.appendEvent(job.id, { kind: 'progress', text: 'Started.' });
        const second = store.appendEvent(job.id, { kind: 'snapshot', text: 'Case summary.' });
        expect(first?.seq).toBe(1);
        expect(second?.seq).toBe(2);
        expect(store.get(job.id)?.status).toBe('running');
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['progress', 'snapshot']);
    });

    it('closes the job on its terminal event', () => {
        const store = new DiagnosticJobStore();
        const succeeded = store.create(request());
        store.appendEvent(succeeded.id, { kind: 'finding', text: 'Replace the sensor.' });
        expect(store.get(succeeded.id)?.status).toBe('succeeded');

        const failed = store.create(request());
        store.appendEvent(failed.id, { kind: 'failed', text: 'Boom.' });
        expect(store.get(failed.id)?.status).toBe('failed');
    });

    it('returns undefined when appending to an unknown job', () => {
        const store = new DiagnosticJobStore();
        expect(store.appendEvent('nope', { kind: 'progress', text: 'x' })).toBeUndefined();
    });

    it('cancels a live job once, and refuses a finished one', () => {
        const store = new DiagnosticJobStore();
        const job = store.create(request());
        expect(store.cancel(job.id)).toBe(true);
        expect(store.get(job.id)?.status).toBe('cancelled');
        expect(store.eventsFor(job.id).map((event) => event.kind)).toEqual(['cancelled']);
        expect(store.cancel(job.id)).toBe(false);
        expect(store.cancel('unknown')).toBe(false);
    });

    it('keeps the highest acked seq', () => {
        const store = new DiagnosticJobStore();
        const job = store.create(request());
        expect(store.setAckedSeq(job.id, 2)).toBe(true);
        expect(store.setAckedSeq(job.id, 1)).toBe(true);
        expect(store.get(job.id)?.ackedSeq).toBe(2);
        expect(store.setAckedSeq('unknown', 1)).toBe(false);
    });

    it('lists one case’s jobs newest first', () => {
        const store = new DiagnosticJobStore();
        const first = store.create(request());
        const other = store.create(request({ caseId: OTHER_CASE_ID }));
        const second = store.create(request());
        expect(store.listByCase(CASE_ID).map((job) => job.id)).toEqual([second.id, first.id]);
        expect(store.listByCase(OTHER_CASE_ID).map((job) => job.id)).toEqual([other.id]);
    });

    it('fans events out to subscribers until they unsubscribe', () => {
        const store = new DiagnosticJobStore();
        const job = store.create(request());
        const seen: string[] = [];
        const unsubscribe = store.subscribe(job.id, (event) => seen.push(event.text));
        store.appendEvent(job.id, { kind: 'progress', text: 'One.' });
        unsubscribe();
        store.appendEvent(job.id, { kind: 'progress', text: 'Two.' });
        expect(seen).toEqual(['One.']);
    });
});
