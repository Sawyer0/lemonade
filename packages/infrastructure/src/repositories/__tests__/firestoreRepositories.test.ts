import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { AIAnalysis, DiagnosticSession, ILogger, Vehicle } from '@lemonade/core';
import { AppError } from '@lemonade/core';
import { FakeFirestore } from './fakeFirestore';

const db = new FakeFirestore();
vi.mock('../../firebase/admin', () => ({ adminDb: db }));

const { FirestoreUserRepository } = await import('../FirestoreUserRepository');
const { FirestoreVehicleRepository } = await import('../FirestoreVehicleRepository');
const { BillingFirestoreRepository } = await import('../BillingFirestoreRepository');
const { FirestoreSessionRepository } = await import('../FirestoreSessionRepository');

function logger(): ILogger {
    return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger;
}

const SESSION_ID = '0b5c2d7e-3f41-4a8b-9c6d-1e2f3a4b5c6d';

function session(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
    const at = new Date('2026-01-01T10:00:00Z');
    return {
        id: SESSION_ID,
        vehicleId: 'veh-1',
        userId: 'user-1',
        status: 'active',
        complaint: 'grinding when braking',
        obdCodes: [],
        aiAnalysis: null,
        messages: [],
        safety_stop: false,
        cumulativeVideoDurationProcessedMinutes: 0,
        cumulativeAudioDurationProcessedMinutes: 0,
        startedAt: at,
        updatedAt: at,
        ...overrides,
    };
}

beforeEach(() => db.clear());

describe('FirestoreUserRepository', () => {
    it('returns null for a missing user', async () => {
        expect(await new FirestoreUserRepository(logger()).findById('nobody')).toBeNull();
    });

    it('reads a valid user and converts timestamps to dates', async () => {
        const createdAt = new Date('2025-06-01T00:00:00Z');
        await db.doc('users/u1').set({
            id: 'u1',
            email: 'u1@example.com',
            tier: 'pro',
            preferences: { autoOpenCamera: true },
            createdAt,
            updatedAt: createdAt,
        });
        const user = await new FirestoreUserRepository(logger()).findById('u1');
        expect(user).toMatchObject({ id: 'u1', tier: 'pro', preferences: { autoOpenCamera: true } });
        expect(user?.createdAt).toEqual(createdAt);
    });

    it('repairs a legacy user with missing dates and tier', async () => {
        const log = logger();
        await db.doc('users/u2').set({ id: 'u2', email: 'u2@example.com', tier: null });
        const user = await new FirestoreUserRepository(log).findById('u2');
        expect(user).toMatchObject({ id: 'u2', tier: 'free', preferences: { autoOpenCamera: false } });
        expect(user?.updatedAt).toEqual(user?.createdAt);
        expect(log.warn).toHaveBeenCalled();
    });

    it('throws when the stored user cannot be repaired', async () => {
        await db.doc('users/u3').set({ id: 'u3', email: 'not-an-email' });
        await expect(new FirestoreUserRepository(logger()).findById('u3')).rejects.toBeInstanceOf(AppError);
    });
});

describe('FirestoreVehicleRepository', () => {
    const vehicle: Vehicle = {
        id: 'veh-1',
        vin: '1HGCM82633A004352',
        userId: 'user-1',
        specs: { year: 2003, make: 'Honda', model: 'Accord', engine: '3.0L V6' },
        activeIssuesCount: 0,
        createdAt: new Date('2026-02-01T00:00:00Z'),
    };

    it('round-trips a vehicle for its owner only', async () => {
        const repo = new FirestoreVehicleRepository();
        await repo.create(vehicle);
        expect(await repo.findById('veh-1', 'user-1')).toEqual(vehicle);
        expect(await repo.findById('veh-1', 'someone-else')).toBeNull();
        expect(await repo.findById('missing', 'user-1')).toBeNull();
    });

    it('lists only the vehicles of one user and defaults missing fields', async () => {
        const repo = new FirestoreVehicleRepository();
        await repo.create(vehicle);
        await db.doc('vehicles/veh-2').set({
            id: 'veh-2',
            vin: 'JH4KA8260MC000000',
            userId: 'user-1',
            createdAt: '2026-03-01T00:00:00Z',
        });
        await repo.create({ ...vehicle, id: 'veh-3', userId: 'user-2' });

        const list = await repo.findByUser('user-1');
        expect(list.map((v) => v.id).sort()).toEqual(['veh-1', 'veh-2']);
        const legacy = list.find((v) => v.id === 'veh-2');
        expect(legacy?.activeIssuesCount).toBe(0);
        expect(legacy?.createdAt).toEqual(new Date('2026-03-01T00:00:00Z'));
    });
});

describe('BillingFirestoreRepository', () => {
    it('logs usage and increments the per-user totals', async () => {
        const repo = new BillingFirestoreRepository(logger());
        const usage = { userId: 'u1', inputTokens: 100, outputTokens: 20, model: 'm', timestamp: new Date() };
        await repo.recordUsage({ ...usage, searchQueries: 2 }, 'trace-1');
        await repo.recordUsage(usage);

        const logs = Object.values(db.documents('ai_usage_logs'));
        expect(logs).toHaveLength(2);
        expect(logs.filter((l) => l.traceId === 'trace-1')).toHaveLength(1);

        const stats = (await db.doc('users/u1/usage/stats').get()).data();
        expect(stats).toMatchObject({ totalInputTokens: 200, totalOutputTokens: 40, totalSearchQueries: 2 });
    });

    it('never throws on invalid usage (billing must not break chat)', async () => {
        const log = logger();
        const invalid = { userId: 'u1', inputTokens: -1, outputTokens: 0, model: 'm', timestamp: new Date() };
        await expect(new BillingFirestoreRepository(log).recordUsage(invalid)).resolves.toBeUndefined();
        expect(log.error).toHaveBeenCalled();
        expect(db.documents('ai_usage_logs')).toEqual({});
    });
});

describe('FirestoreSessionRepository', () => {
    let repo: InstanceType<typeof FirestoreSessionRepository>;
    beforeEach(() => {
        repo = new FirestoreSessionRepository(logger());
    });

    it('creates, reads and deletes a session', async () => {
        await repo.create(session());
        const stored = await repo.findById(SESSION_ID);
        expect(stored).toEqual(session());
        expect(await repo.getHistory(SESSION_ID)).toEqual(stored);
        await repo.delete(SESSION_ID);
        expect(await repo.findById(SESSION_ID)).toBeNull();
    });

    it('rejects an invalid session on create', async () => {
        await expect(repo.create(session({ id: 'not-a-uuid' }))).rejects.toThrow();
    });

    it('fails loudly on a corrupted stored session', async () => {
        await db.doc(`sessions/${SESSION_ID}`).set({ id: SESSION_ID, status: 'bogus' });
        await expect(repo.findById(SESSION_ID)).rejects.toBeInstanceOf(AppError);
    });

    it('appends messages and updates status, complaint, video and safety stop', async () => {
        await repo.create(session());
        await repo.addMessage(SESSION_ID, 'user', 'it squeaks');
        await repo.addMessage(SESSION_ID, 'assistant', [{ type: 'text', text: 'Check the pads.' }]);
        await repo.updateStatus(SESSION_ID, 'analyzing');
        await repo.updateComplaint(SESSION_ID, 'squeak at low speed');
        await repo.updateVideo(SESSION_ID, 'gs://bucket/video.mp4');
        await repo.flagSafetyStop(SESSION_ID, 'fuel leak');

        const stored = await repo.findById(SESSION_ID);
        expect(stored?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
        expect(stored?.messages[0].timestamp).toBeInstanceOf(Date);
        expect(stored).toMatchObject({
            status: 'analyzing',
            complaint: 'squeak at low speed',
            videoUrl: 'gs://bucket/video.mp4',
            safety_stop: true,
            safety_reason: 'fuel leak',
        });
    });

    it('validates inputs before writing', async () => {
        await repo.create(session());
        await expect(repo.updateComplaint(SESSION_ID, '')).rejects.toBeInstanceOf(AppError);
        await expect(repo.updateVideo(SESSION_ID, '')).rejects.toBeInstanceOf(AppError);
    });

    it('stores a valid analysis and moves the session to waiting_user', async () => {
        await repo.create(session());
        const analysis: AIAnalysis = {
            diagnosis: 'Worn front brake pads',
            reasoning: 'Grinding only under braking',
            investigationPlan: ['Inspect pad thickness'],
            visual_evidence: [],
            acoustic_evidence: ['metallic grinding'],
            severity: 'medium',
            safety_alert: false,
            suggested_actions: ['Replace front pads'],
            engineDescription: 'Front left wheel',
            isStock: true,
            visualConflictDetected: false,
            detectedCondition: 'unknown',
            confidence: 0.8,
        };
        await repo.updateAnalysis(SESSION_ID, analysis);
        expect(await repo.findById(SESSION_ID)).toMatchObject({ status: 'waiting_user', aiAnalysis: analysis });
        await expect(repo.updateAnalysis(SESSION_ID, { ...analysis, confidence: 3 })).rejects.toThrow();
    });

    it('accumulates processed video and audio minutes', async () => {
        await repo.create(session());
        await repo.updateCumulativeVideoDuration(SESSION_ID, 1.5);
        await repo.updateCumulativeVideoDuration(SESSION_ID, 2);
        await repo.updateCumulativeAudioDuration(SESSION_ID, 3);
        await repo.updateLastProcessedFrameTimestamp(SESSION_ID, 1000);
        await repo.updateLastProcessedAudioChunkTimestamp(SESSION_ID, 2000);
        expect(await repo.findById(SESSION_ID)).toMatchObject({
            cumulativeVideoDurationProcessedMinutes: 3.5,
            cumulativeAudioDurationProcessedMinutes: 3,
            lastProcessedFrameTimestamp: 1000,
            lastProcessedAudioChunkTimestamp: 2000,
        });
        await expect(repo.updateCumulativeVideoDuration('missing', 1)).rejects.toBeInstanceOf(AppError);
        await expect(repo.updateCumulativeAudioDuration('missing', 1)).rejects.toBeInstanceOf(AppError);
    });

    it('lists sessions by vehicle and user, newest first, skipping corrupted ones', async () => {
        await repo.create(session());
        const newer = '1c6d3e8f-4a52-4b9c-8d7e-2f3a4b5c6d7e';
        await repo.create(session({ id: newer, startedAt: new Date('2026-05-01T00:00:00Z') }));
        await db.doc('sessions/broken').set({
            id: 'broken',
            vehicleId: 'veh-1',
            userId: 'user-1',
            startedAt: Timestamp.now(),
        });

        expect((await repo.findByVehicleId('veh-1')).map((s) => s.id)).toEqual([newer, SESSION_ID]);
        expect((await repo.findByUserId('user-1')).map((s) => s.id)).toEqual([newer, SESSION_ID]);
        expect(await repo.findByVehicleId('')).toEqual([]);
        expect(await repo.findByUserId('')).toEqual([]);
    });

    it('saves, reads and clears the xstate snapshot without throwing on failure', async () => {
        await repo.create(session());
        await repo.saveXStateSnapshot(SESSION_ID, { value: 'diagnosing', context: { n: 1 } });
        expect(await repo.getXStateSnapshot(SESSION_ID)).toEqual({ value: 'diagnosing', context: { n: 1 } });
        await repo.clearXStateSnapshot(SESSION_ID);
        expect(await repo.getXStateSnapshot(SESSION_ID)).toBeNull();
        expect(await repo.getXStateSnapshot('missing')).toBeNull();
        await expect(repo.saveXStateSnapshot('missing', {})).resolves.toBeUndefined();
        await expect(repo.clearXStateSnapshot('missing')).resolves.toBeUndefined();
    });
});
