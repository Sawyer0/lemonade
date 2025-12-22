import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiFlashLiveStreamAdapter } from '../GeminiFlashLiveStreamAdapter';
import { ILogger, IBillingService, IGoogleSearchService, IContextCacheService, IUserRepository, ISessionRepository } from '@lemonade/core';
import { TracingService } from '../../observability/TracingService';
import { GeminiCoreAdapter } from '../GeminiCoreAdapter';

describe('GeminiFlashLiveStreamAdapter', () => {
    let adapter: GeminiFlashLiveStreamAdapter;
    let mockLogger: ILogger;
    let mockBillingService: IBillingService;
    let mockCoreAdapter: GeminiCoreAdapter;
    let mockSearchService: IGoogleSearchService;
    let mockCacheService: IContextCacheService;
    let mockUserRepo: IUserRepository;
    let mockSessionRepo: ISessionRepository;
    let mockTracer: TracingService;
    let mockModel: any;
    let mockChat: any;

    beforeEach(() => {
        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
        mockBillingService = { recordUsage: vi.fn().mockResolvedValue(undefined) } as any;
        mockSearchService = { search: vi.fn() } as any;
        mockCacheService = { getCache: vi.fn().mockResolvedValue(null), createCache: vi.fn().mockResolvedValue(undefined) } as any;
        mockUserRepo = { findById: vi.fn().mockResolvedValue({ tier: 'pro' }) } as any;
        mockSessionRepo = { findById: vi.fn().mockResolvedValue({ cumulativeVideoDurationProcessedMinutes: 0 }), updateLastProcessedFrameTimestamp: vi.fn(), updateCumulativeVideoDuration: vi.fn() } as any;
        mockTracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as any;

        mockChat = {
            sendMessage: vi.fn()
        };

        mockModel = {
            startChat: vi.fn().mockReturnValue(mockChat),
            generateContent: vi.fn()
        };

        mockCoreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(mockModel),
            commonTools: [],
            commonSafetySettings: []
        } as any;

        adapter = new GeminiFlashLiveStreamAdapter(
            mockLogger,
            mockBillingService,
            mockCoreAdapter,
            mockSearchService,
            mockCacheService,
            mockUserRepo,
            mockSessionRepo,
            mockTracer
        );
    });

    it('should handle tool calls during live image analysis', async () => {
        const responseWithToolCall = {
            response: {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'Checking for recalls.' },
                            { functionCall: { name: 'google_search', args: { query: 'recall check' } } }
                        ]
                    }
                }],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 }
            }
        };

        // 1. Initial call returns google_search
        mockChat.sendMessage.mockResolvedValueOnce(responseWithToolCall);
        
        // 2. Search service returns results
        mockSearchService.search = vi.fn().mockResolvedValue({ results: [], queryUsed: 'recall check', totalFound: 0 });

        // 3. Second call (after search) returns final answer
        const finalResponse = {
            response: {
                candidates: [{
                    content: {
                        parts: [{ text: '{"diagnosis": "No recalls found", "confidence": 0.9, "visual_evidence": [], "acoustic_evidence": [], "severity": "low", "safety_alert": false, "suggested_actions": [], "engineDescription": "Stock", "isStock": true, "visualConflictDetected": false, "detectedCondition": "clean"}' }]
                    }
                }]
            }
        };
        mockChat.sendMessage.mockResolvedValueOnce(finalResponse);

        const result = await adapter.analyzeLiveImageFrame('base64', 'image/jpeg', 'car', 'user-1', 'session-1');

        expect(mockSearchService.search).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect((result as any).diagnosis).toBe('No recalls found');
    });
});
