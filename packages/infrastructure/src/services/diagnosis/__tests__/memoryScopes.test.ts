import { describe, it, expect, vi } from 'vitest';
import type {
    IEmbeddingService,
    ILogger,
    ISessionRepository,
    IVectorRepository,
    NeurosymbolicState,
} from '@lemonade/core';
import { DiagnosisMemoryWriter } from '../DiagnosisMemoryWriter';

function logger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

function state(verified = false): NeurosymbolicState {
    return {
        intuition: { hypothesis: 'pads', confidence: 0.8, reasoning: '', investigationPlan: [] },
        authorityData: { vin: '19XFB2F59FE000000', nhtsaRecalls: [], manualSpecs: null, safetyAlerts: [] },
        visualGrounding: {
            engineDescription: '',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown',
        },
        consensus: { similarCasesFound: 0, consensusFix: null, isKnownIssue: false },
        verification: {
            isVerified: verified,
            verifiedHypothesis: null,
            verificationSteps: [],
            failedAttempts: [],
            toolResults: [],
        },
        finalDiagnosis: {
            decision: 'PROCEED',
            reasoningTrace: 'trace',
            userOutput: 'Worn pads',
            requiredActions: ['Replace pads'],
            metaConfidence: 0.9,
        },
    };
}

function writer() {
    const deps = {
        embedding: { embed: vi.fn().mockResolvedValue([0.1]) },
        vectors: { addCase: vi.fn().mockResolvedValue(undefined) },
        sessions: { findById: vi.fn().mockResolvedValue(null) },
        log: logger(),
    };
    const subject = new DiagnosisMemoryWriter(
        deps.embedding as unknown as IEmbeddingService,
        deps.vectors as unknown as IVectorRepository,
        deps.sessions as unknown as ISessionRepository,
        deps.log,
    );
    return { subject, ...deps };
}

function savedRecord(deps: ReturnType<typeof writer>): Record<string, unknown> {
    return deps.vectors.addCase.mock.calls[0][2] as Record<string, unknown>;
}

describe('DiagnosisMemoryWriter shop scope (LM-31)', () => {
    it('keeps the user scope when no shop scope is given', async () => {
        const deps = writer();
        await deps.subject.save('grinding', state(), 'u-1', 's-1');
        const record = savedRecord(deps);
        expect(record.userId).toBe('u-1');
        expect(record.vehicle).toBe('19XFB2F59FE000000');
        expect(record.shopId).toBeUndefined();
        expect(record.diagnosticLog).toContain('Final Diagnosis: Worn pads');
    });

    it('scopes the vector record by shop and VIN when a shop scope is given', async () => {
        const deps = writer();
        await deps.subject.save('grinding', state(), 'u-1', 's-1', {
            shopId: 'shop-1',
            ledgerEventIds: ['e-1', 'e-2'],
        });
        const record = savedRecord(deps);
        expect(record.shopId).toBe('shop-1');
        expect(record.ledgerEventIds).toEqual(['e-1', 'e-2']);
        expect(record.provenance).toBe('ledger-grounded');
        expect(record.vehicle).toBe('19XFB2F59FE000000');
    });

    it('marks the unscoped log as model-sourced, never a vehicle fact', async () => {
        const deps = writer();
        await deps.subject.save('grinding', state(), 'u-1', 's-1');
        expect(savedRecord(deps).provenance).toBe('model');
    });

    it('stays model-sourced when a shop scope cites no ledger events', async () => {
        const deps = writer();
        await deps.subject.save('grinding', state(), 'u-1', 's-1', { shopId: 'shop-1' });
        const record = savedRecord(deps);
        expect(record.shopId).toBe('shop-1');
        expect(record.provenance).toBe('model');
    });

    it('attaches the session video and images to a verified case record', async () => {
        const deps = writer();
        deps.sessions.findById.mockResolvedValue({
            videoUrl: 'gs://v.mp4',
            messages: [
                { content: [{ type: 'image', image: 'gs://i1.jpg' }] },
                { content: [{ type: 'image', image: 'gs://i2.jpg' }] },
            ],
        });
        await deps.subject.save('grinding', state(true), 'u-1', 's-1');
        const record = savedRecord(deps);
        expect(record.isVerified).toBe(true);
        expect(record.videoUrl).toBe('gs://v.mp4');
        expect(record.imageUrls).toEqual(['gs://i1.jpg', 'gs://i2.jpg']);
    });

    it('saves the record without artifacts when the session cannot be read', async () => {
        const deps = writer();
        deps.sessions.findById.mockRejectedValue(new Error('session store down'));
        await deps.subject.save('grinding', state(true), 'u-1', 's-1');
        const record = savedRecord(deps);
        expect(record.videoUrl).toBeUndefined();
        expect(record.imageUrls).toBeUndefined();
    });
});
