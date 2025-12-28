import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiFlashLiveStreamAdapter } from '../GeminiFlashLiveStreamAdapter';
import { ILogger, IBillingService, IContextCacheService, IUserRepository, ISessionRepository, AIAnalysis } from '@lemonade/core';
import { TracingService } from '../../observability/TracingService';
import { GeminiCoreAdapter } from '../GeminiCoreAdapter';
import { FunctionCallService } from '../FunctionCallHandler';
import { GenerativeModel, ChatSession } from '@google-cloud/vertexai';

describe('GeminiFlashLiveStreamAdapter', () => {
    let adapter: GeminiFlashLiveStreamAdapter;
    let mockLogger: ILogger;
    let mockBillingService: IBillingService;
    let mockCoreAdapter: GeminiCoreAdapter;
    let mockFunctionCallService: FunctionCallService;
    let mockCacheService: IContextCacheService;
    let mockUserRepo: IUserRepository;
    let mockSessionRepo: ISessionRepository;
    let mockTracer: TracingService;
    let mockModel: GenerativeModel;
    let mockChat: ChatSession;

    beforeEach(() => {
        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
        mockBillingService = { recordUsage: vi.fn().mockResolvedValue(undefined) } as unknown as IBillingService;
        
        mockFunctionCallService = { 
            handleFunctionCalls: vi.fn().mockImplementation((response) => Promise.resolve(response)) 
        } as unknown as FunctionCallService;

        mockCacheService = { getCache: vi.fn().mockResolvedValue(null), createCache: vi.fn().mockResolvedValue(undefined) } as unknown as IContextCacheService;
        mockUserRepo = { findById: vi.fn().mockResolvedValue({ tier: 'pro' }) } as unknown as IUserRepository;
        mockSessionRepo = { findById: vi.fn().mockResolvedValue({ cumulativeVideoDurationProcessedMinutes: 0 }), updateLastProcessedFrameTimestamp: vi.fn(), updateCumulativeVideoDuration: vi.fn() } as unknown as ISessionRepository;
        mockTracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as unknown as TracingService;

        mockChat = {
            sendMessage: vi.fn()
        } as unknown as ChatSession;

        mockModel = {
            startChat: vi.fn().mockReturnValue(mockChat),
            generateContent: vi.fn()
        } as unknown as GenerativeModel;

        mockCoreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(mockModel),
            commonTools: [],
            commonSafetySettings: []
        } as unknown as GeminiCoreAdapter;

        adapter = new GeminiFlashLiveStreamAdapter(
            mockLogger,
            mockBillingService,
            mockCoreAdapter,
            mockFunctionCallService,
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
        (mockChat.sendMessage as jest.Mock).mockResolvedValueOnce(responseWithToolCall);
        
        // 2. Mock FunctionCallService to return final answer
        const finalResponse = {
            response: {
                candidates: [{
                    content: {
                        parts: [{ text: JSON.stringify({
                            diagnosis: "No recalls found",
                            reasoning: "Search confirmed no open recalls.",
                            investigationPlan: [],
                            confidence: 0.9,
                            visual_evidence: [],
                            acoustic_evidence: [],
                            severity: "low",
                            safety_alert: false,
                            suggested_actions: [],
                            engineDescription: "Stock",
                            isStock: true,
                            visualConflictDetected: false,
                            detectedCondition: "clean"
                        }) }]
                    }
                }]
            }
        };
        (mockFunctionCallService.handleFunctionCalls as jest.Mock).mockResolvedValue(finalResponse.response);

        const result = await adapter.analyzeLiveImageFrame('base64', 'image/jpeg', 'car', 'user-1', 'session-1');

        expect(mockFunctionCallService.handleFunctionCalls).toHaveBeenCalled();
        expect(result).toBeDefined();
        expect((result as AIAnalysis).diagnosis).toBe('No recalls found');
    });
});
