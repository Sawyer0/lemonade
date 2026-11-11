import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillingService } from '../BillingService';
import { AIUsageRecord, IBillingRepository } from '@lemonade/core';

const mockBillingRepo = {
    recordUsage: vi.fn().mockResolvedValue(undefined),
};

describe('BillingService Integration', () => {
    let service: BillingService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new BillingService(mockBillingRepo as unknown as IBillingRepository);
    });

    it('should record usage correctly', async () => {
        const usage: AIUsageRecord = {
            userId: 'user-123',
            sessionId: 'session-456',
            inputTokens: 100,
            outputTokens: 50,
            model: 'gemini-test',
            timestamp: new Date(),
        };

        await service.recordUsage(usage);

        expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
    });

    describe('Error Handling', () => {
        it('should propagate repository errors', async () => {
            mockBillingRepo.recordUsage.mockRejectedValueOnce(new Error('Database connection failed'));

            const usage: AIUsageRecord = {
                userId: 'user-123',
                sessionId: 'session-456',
                inputTokens: 100,
                outputTokens: 50,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            await expect(service.recordUsage(usage)).rejects.toThrow('Database connection failed');
        });

        it('should handle repository timeout', async () => {
            mockBillingRepo.recordUsage.mockRejectedValueOnce(new Error('Operation timed out'));

            const usage: AIUsageRecord = {
                userId: 'user-123',
                sessionId: 'session-456',
                inputTokens: 100,
                outputTokens: 50,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            await expect(service.recordUsage(usage)).rejects.toThrow('Operation timed out');
        });
    });

    describe('Edge Cases', () => {
        it('should handle zero token counts', async () => {
            const usage: AIUsageRecord = {
                userId: 'user-123',
                sessionId: 'session-456',
                inputTokens: 0,
                outputTokens: 0,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            await service.recordUsage(usage);

            expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
        });

        it('should handle very large token counts', async () => {
            const usage: AIUsageRecord = {
                userId: 'user-123',
                sessionId: 'session-456',
                inputTokens: 1_000_000,
                outputTokens: 500_000,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            await service.recordUsage(usage);

            expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
        });

        it('should handle empty userId', async () => {
            const usage: AIUsageRecord = {
                userId: '',
                sessionId: 'session-456',
                inputTokens: 100,
                outputTokens: 50,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            // Service should still call repo - validation is repo's responsibility
            await service.recordUsage(usage);
            expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
        });

        it('should handle empty sessionId', async () => {
            const usage: AIUsageRecord = {
                userId: 'user-123',
                sessionId: '',
                inputTokens: 100,
                outputTokens: 50,
                model: 'gemini-test',
                timestamp: new Date(),
            };

            await service.recordUsage(usage);
            expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
        });
    });

    describe('Concurrent Writes', () => {
        it('should handle multiple concurrent usage records', async () => {
            const usages: AIUsageRecord[] = Array.from({ length: 10 }, (_, i) => ({
                userId: `user-${i}`,
                sessionId: `session-${i}`,
                inputTokens: 100 * (i + 1),
                outputTokens: 50 * (i + 1),
                model: 'gemini-test',
                timestamp: new Date(),
            }));

            // Record all usages concurrently
            await Promise.all(usages.map((usage) => service.recordUsage(usage)));

            expect(mockBillingRepo.recordUsage).toHaveBeenCalledTimes(10);
        });

        it('should handle partial failures in concurrent writes', async () => {
            // Fail on 3rd call
            mockBillingRepo.recordUsage
                .mockResolvedValueOnce(undefined)
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Write failed'))
                .mockResolvedValue(undefined);

            const usages: AIUsageRecord[] = Array.from({ length: 5 }, (_, i) => ({
                userId: `user-${i}`,
                sessionId: `session-${i}`,
                inputTokens: 100,
                outputTokens: 50,
                model: 'gemini-test',
                timestamp: new Date(),
            }));

            const results = await Promise.allSettled(usages.map((usage) => service.recordUsage(usage)));

            const fulfilled = results.filter((r) => r.status === 'fulfilled');
            const rejected = results.filter((r) => r.status === 'rejected');

            expect(fulfilled.length).toBe(4);
            expect(rejected.length).toBe(1);
        });
    });
});
