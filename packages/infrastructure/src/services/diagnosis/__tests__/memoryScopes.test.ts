import { describe, it, expect, vi } from 'vitest';
import type {
    IEmbeddingService,
    ILogger,
    IMemoryService,
    ISessionRepository,
    IVectorRepository,
    NeurosymbolicState,
} from '@lemonade/core';
import { DiagnosisMemoryWriter } from '../DiagnosisMemoryWriter';

function logger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

function state(): NeurosymbolicState {
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
            isVerified: false,
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
        memory: { addDocument: vi.fn().mockResolvedValue(undefined) },
        sessions: { findById: vi.fn().mockResolvedValue(null) },
        log: logger(),
    };
    const subject = new DiagnosisMemoryWriter(
        deps.embedding as unknown as IEmbeddingService,
        deps.vectors as unknown as IVectorRepository,
        deps.memory as unknown as IMemoryService,
        deps.sessions as unknown as ISessionRepository,
        deps.log,
    );
    return { subject, ...deps };
}

describe('DiagnosisMemoryWriter shop scope (LM-31)', () => {
    it('keeps the user scope when no shop scope is given', async () => {
        const { subject, memory } = writer();
        await subject.save('grinding', state(), 'u-1', 's-1');
        const doc = memory.addDocument.mock.calls[0][0];
        expect(doc.tags).toEqual(expect.arrayContaining(['user:u-1', 'vin:19XFB2F59FE000000']));
        expect(doc.metadata.shopId).toBeUndefined();
    });

    it('tags the diagnostic log by shop and VIN when a shop scope is given', async () => {
        const { subject, memory } = writer();
        await subject.save('grinding', state(), 'u-1', 's-1', {
            shopId: 'shop-1',
            ledgerEventIds: ['e-1', 'e-2'],
        });
        const doc = memory.addDocument.mock.calls[0][0];
        expect(doc.tags).toEqual(expect.arrayContaining(['shop:shop-1', 'vin:19XFB2F59FE000000']));
        expect(doc.tags).not.toContain('user:u-1');
        expect(doc.metadata.shopId).toBe('shop-1');
        expect(doc.metadata.ledgerEventIds).toEqual(['e-1', 'e-2']);
        expect(doc.metadata.provenance).toBe('ledger-grounded');
    });

    it('marks the unscoped log as model-sourced, never a vehicle fact', async () => {
        const { subject, memory } = writer();
        await subject.save('grinding', state(), 'u-1', 's-1');
        const doc = memory.addDocument.mock.calls[0][0];
        expect(doc.metadata.provenance).toBe('model');
    });

    it('stays model-sourced when a shop scope cites no ledger events', async () => {
        const { subject, memory } = writer();
        await subject.save('grinding', state(), 'u-1', 's-1', { shopId: 'shop-1' });
        const doc = memory.addDocument.mock.calls[0][0];
        expect(doc.tags).toEqual(expect.arrayContaining(['shop:shop-1']));
        expect(doc.metadata.provenance).toBe('model');
    });
});
