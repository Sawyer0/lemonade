import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BillingService } from '../BillingService';
import { AIUsageRecord } from '@lemonade/core';

const mockBillingRepo = {
    recordUsage: vi.fn().mockResolvedValue(undefined)
};

describe('BillingService Integration', () => {
    let service: BillingService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new BillingService(mockBillingRepo as any);
    });

    it('should record usage correctly', async () => {
        const usage: AIUsageRecord = {
            userId: 'user-123',
            sessionId: 'session-456',
            inputTokens: 100,
            outputTokens: 50,
            model: 'gemini-pro',
            timestamp: new Date()
        };

        await service.recordUsage(usage);

        expect(mockBillingRepo.recordUsage).toHaveBeenCalledWith(usage);
    });
});
