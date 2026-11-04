import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { VectorRepository } from '../VectorRepository';
import type { IEmbeddingService, ILogger } from '@lemonade/core';

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => {
    return {
        getFirestore: vi.fn(),
        FieldValue: {
            vector: vi.fn((v) => v),
            serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
        },
        Filter: {
            where: vi.fn((field, op, value) => ({ field, op, value })),
            and: vi.fn((...filters) => ({ type: 'and', filters })),
        },
        Timestamp: {
            now: vi.fn(() => ({ toDate: () => new Date() })),
        },
    };
});

const mockLogger: ILogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
};

const mockEmbedContent = vi.fn();
/** Embedding service fake fed by the raw model reply each test queues. */
const fakeEmbeddings: IEmbeddingService = {
    embed: async (text: string) => {
        const result = (await mockEmbedContent(text)) as { embedding?: { values?: number[] } | null };
        const values = result?.embedding?.values;
        if (!values) throw new Error('No embedding returned');
        return values;
    },
    embedBatch: async () => [],
};

describe('VectorRepository', () => {
    let repository: VectorRepository;
    let mockDocSet: Mock;
    let mockVectorQueryGet: Mock;
    let mockFindNearest: Mock;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Setup mock chain for each test
        mockDocSet = vi.fn().mockResolvedValue(undefined);
        mockVectorQueryGet = vi.fn().mockResolvedValue({ docs: [] });
        mockFindNearest = vi.fn().mockReturnValue({ get: mockVectorQueryGet });

        const { getFirestore } = await import('firebase-admin/firestore');
        (getFirestore as Mock).mockReturnValue({
            collection: vi.fn().mockReturnValue({
                doc: vi.fn().mockReturnValue({ set: mockDocSet }),
                findNearest: mockFindNearest,
            }),
        });

        // Default embedding response
        mockEmbedContent.mockResolvedValue({
            embedding: { values: [0.1, 0.2, 0.3, 0.4, 0.5] },
        });

        repository = new VectorRepository(mockLogger, fakeEmbeddings);
    });

    describe('search', () => {
        it('should call embedding and firestore for valid query', async () => {
            // Test that the correct services are called
            const results = await repository.search('brake issues', 5);

            // Embedding should be called
            expect(mockEmbedContent).toHaveBeenCalled();
            // Firestore findNearest should be called
            expect(mockFindNearest).toHaveBeenCalled();
            // Results should be an array (empty due to mock default)
            expect(Array.isArray(results)).toBe(true);
        });

        describe('Empty Results', () => {
            it('should return empty array when no documents match', async () => {
                const results = await repository.search('nonexistent topic', 5);
                expect(results).toEqual([]);
            });

            it('should return empty array for empty query string', async () => {
                const results = await repository.search('', 5);
                expect(results).toEqual([]);
            });
        });

        describe('Embedding Failures', () => {
            it('should return empty array when embedding generation fails', async () => {
                mockEmbedContent.mockRejectedValueOnce(new Error('Embedding API unavailable'));

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Search failed'),
                    expect.any(Error),
                );
            });

            it('should return empty array when embedding returns null', async () => {
                mockEmbedContent.mockResolvedValueOnce({ embedding: null });

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
                expect(mockLogger.error).toHaveBeenCalled();
            });

            it('should return empty array when embedding values are missing', async () => {
                mockEmbedContent.mockResolvedValueOnce({ embedding: {} });

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
            });

            it('should handle rate limiting from embedding API', async () => {
                mockEmbedContent.mockRejectedValueOnce(new Error('429 Too Many Requests'));

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
            });
        });

        describe('Database Failures', () => {
            it('should return empty array when Firestore query fails', async () => {
                mockVectorQueryGet.mockRejectedValueOnce(new Error('Firestore unavailable'));

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
            });

            it('should return empty array on permission denied', async () => {
                mockVectorQueryGet.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

                const results = await repository.search('test query', 5);

                expect(results).toEqual([]);
            });
        });

        describe('Malformed Data', () => {
            it('should log error when document validation fails', async () => {
                const mockDocs = [
                    {
                        id: 'invalid-doc',
                        data: () => ({
                            // Missing required 'text' field - will fail Zod validation
                            embedding: { values: [0.1, 0.2] },
                            metadata: {},
                            createdAt: 'invalid', // Also invalid createdAt
                            _distance: 0.2,
                        }),
                    },
                ];

                mockVectorQueryGet.mockResolvedValueOnce({ docs: mockDocs });

                const results = await repository.search('test', 5);

                // Invalid docs should be filtered out
                expect(results).toHaveLength(0);
                // Error should be logged for validation failure
                expect(mockLogger.error).toHaveBeenCalled();
            });

            it('should handle documents with invalid createdAt format', async () => {
                const mockDocs = [
                    {
                        id: 'doc-1',
                        data: () => ({
                            text: 'Test document',
                            embedding: { values: [0.1] },
                            metadata: {},
                            createdAt: 'invalid-date',
                            _distance: 0.1,
                        }),
                    },
                ];

                mockVectorQueryGet.mockResolvedValueOnce({ docs: mockDocs });

                const results = await repository.search('test', 5);
                expect(Array.isArray(results)).toBe(true);
            });

            it('should handle null metadata gracefully', async () => {
                const mockDocs = [
                    {
                        id: 'doc-1',
                        data: () => ({
                            text: 'Test document',
                            embedding: { values: [0.1] },
                            metadata: null,
                            createdAt: { toDate: () => new Date() },
                            _distance: 0.1,
                        }),
                    },
                ];

                mockVectorQueryGet.mockResolvedValueOnce({ docs: mockDocs });

                const results = await repository.search('test', 5);
                expect(Array.isArray(results)).toBe(true);
            });
        });

        describe('Filter Edge Cases', () => {
            it('should handle filter with empty object', async () => {
                const results = await repository.search('test', 5, {});
                expect(results).toEqual([]);
            });

            it('should handle filter with multiple conditions', async () => {
                const results = await repository.search('test', 5, {
                    category: 'brakes',
                    difficulty: 'easy',
                });
                expect(results).toEqual([]);
            });
        });

        describe('Limit Edge Cases', () => {
            it('should handle limit of 0', async () => {
                const results = await repository.search('test', 0);
                expect(Array.isArray(results)).toBe(true);
            });

            it('should handle very large limit', async () => {
                const results = await repository.search('test', 10000);
                expect(Array.isArray(results)).toBe(true);
            });
        });
    });

    describe('findSimilar', () => {
        it('should return similar cases with scores', async () => {
            const mockDocs = [
                {
                    id: 'case-1',
                    data: () => ({
                        text: 'Similar case 1',
                        metadata: { sessionId: 'session-1' },
                        _distance: 0.1,
                    }),
                },
            ];

            mockVectorQueryGet.mockResolvedValueOnce({ docs: mockDocs });

            const vector = [0.1, 0.2, 0.3];
            const results = await repository.findSimilar(vector, 3);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('case-1');
            expect(results[0].score).toBe(0.9);
        });

        it('should return empty array for empty vector', async () => {
            const results = await repository.findSimilar([], 3);
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle missing _distance field', async () => {
            const mockDocs = [
                {
                    id: 'case-1',
                    data: () => ({
                        text: 'Case without distance',
                        metadata: {},
                    }),
                },
            ];

            mockVectorQueryGet.mockResolvedValueOnce({ docs: mockDocs });

            const results = await repository.findSimilar([0.1, 0.2], 3);

            expect(results[0].score).toBe(1.0);
        });

        it('should apply userId filter when provided', async () => {
            await repository.findSimilar([0.1], 3, { userId: 'user-123' });
            expect(mockFindNearest).toHaveBeenCalled();
        });
    });

    describe('addCase', () => {
        it('should add case with metadata', async () => {
            const text = 'New case about brake issues';
            const vector = [0.1, 0.2, 0.3];
            const metadata = { category: 'brakes', severity: 'high' };

            await repository.addCase(text, vector, metadata);

            expect(mockDocSet).toHaveBeenCalledWith({
                text,
                embedding: vector,
                metadata,
                createdAt: 'SERVER_TIMESTAMP',
            });
        });

        it('should add case without metadata', async () => {
            const text = 'Simple case';
            const vector = [0.1];

            await repository.addCase(text, vector);

            expect(mockDocSet).toHaveBeenCalledWith({
                text,
                embedding: vector,
                metadata: {},
                createdAt: 'SERVER_TIMESTAMP',
            });
        });

        it('should propagate Firestore write errors', async () => {
            mockDocSet.mockRejectedValueOnce(new Error('Write failed'));

            await expect(repository.addCase('test', [0.1])).rejects.toThrow('Write failed');
        });

        it('should handle empty text', async () => {
            await repository.addCase('', [0.1]);
            expect(mockDocSet).toHaveBeenCalled();
        });

        it('should handle empty vector', async () => {
            await repository.addCase('test', []);
            expect(mockDocSet).toHaveBeenCalled();
        });
    });
});
