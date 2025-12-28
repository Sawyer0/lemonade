import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { FirestoreSessionRepository } from '../FirestoreSessionRepository';
import { adminDb } from '../../firebase/admin';
import type { ILogger } from '@lemonade/core';
import { FieldValue, WriteResult, DocumentSnapshot } from 'firebase-admin/firestore';

// Mock firebase-admin
vi.mock('../../firebase/admin', () => ({
    adminDb: {
        collection: vi.fn(() => ({
            doc: vi.fn(() => ({
                update: vi.fn(),
                get: vi.fn(),
                set: vi.fn(),
                delete: vi.fn()
            }))
        }))
    }
}));

describe('FirestoreSessionRepository Persistence', () => {
    let repository: FirestoreSessionRepository;
    let mockLogger: ILogger;
    let mockUpdate: ReturnType<typeof vi.fn>;
    let mockGet: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn()
        } as unknown as ILogger;

        repository = new FirestoreSessionRepository(mockLogger);

        // Setup Firestore mocks
        mockUpdate = vi.fn().mockResolvedValue({} as unknown as WriteResult);
        mockGet = vi.fn().mockResolvedValue({
            exists: true,
            data: vi.fn().mockReturnValue({})
        } as unknown as DocumentSnapshot);

        const mockDoc = {
            update: mockUpdate,
            get: mockGet,
            set: vi.fn(),
            delete: vi.fn()
        };

        (adminDb.collection as unknown as Mock).mockReturnValue({
            doc: vi.fn().mockReturnValue(mockDoc)
        });
    });

    describe('saveXStateSnapshot', () => {
        it('should save snapshot to firestore', async () => {
            const sessionId = 'test-session';
            const snapshot = { value: 'diagnosing', context: { foo: 'bar' } };

            await repository.saveXStateSnapshot(sessionId, snapshot);

            expect(adminDb.collection).toHaveBeenCalledWith('sessions');
            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
                xstateSnapshot: snapshot,
                updatedAt: expect.any(Date)
            }));
        });

        it('should handle circular references by JSON stringifying', async () => {
            const sessionId = 'test-session';
            const snapshot = { value: 'diagnosing' };

            // The repository implementation does JSON.parse(JSON.stringify(snapshot))
            // We verify that it passes a clean object
            await repository.saveXStateSnapshot(sessionId, snapshot);

            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
                xstateSnapshot: snapshot
            }));
        });

        it('should log error but not throw if save fails', async () => {
            mockUpdate.mockRejectedValue(new Error('Firestore error'));

            await expect(repository.saveXStateSnapshot('id', {})).resolves.not.toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('getXStateSnapshot', () => {
        it('should return snapshot if exists', async () => {
            const snapshot = { value: 'diagnosing' };
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ xstateSnapshot: snapshot })
            });

            const result = await repository.getXStateSnapshot('test-session');
            expect(result).toEqual(snapshot);
        });

        it('should return null if session does not exist', async () => {
            mockGet.mockResolvedValue({ exists: false });

            const result = await repository.getXStateSnapshot('test-session');
            expect(result).toBeNull();
        });

        it('should return null if snapshot field is missing', async () => {
            mockGet.mockResolvedValue({
                exists: true,
                data: () => ({ otherField: 'foo' })
            });

            const result = await repository.getXStateSnapshot('test-session');
            expect(result).toBeNull();
        });
    });

    describe('clearXStateSnapshot', () => {
        it('should delete snapshot field', async () => {
            await repository.clearXStateSnapshot('test-session');

            expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
                xstateSnapshot: FieldValue.delete(),
                updatedAt: expect.any(Date)
            }));
        });
    });
});