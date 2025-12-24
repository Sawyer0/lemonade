import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiFlashChatAndUploadsAdapter } from '../GeminiFlashChatAndUploadsAdapter';
import { ILogger, IBillingService, IContextCacheService } from '@lemonade/core';
import { TracingService } from '../../observability/TracingService';
import { GeminiCoreAdapter } from '../GeminiCoreAdapter';
import { FunctionCallService } from '../FunctionCallHandler';

describe('GeminiFlashChatAndUploadsAdapter', () => {
    let adapter: GeminiFlashChatAndUploadsAdapter;
    let mockLogger: ILogger;
    let mockBillingService: IBillingService;
    let mockCoreAdapter: GeminiCoreAdapter;
    let mockFunctionCallService: FunctionCallService;
    let mockCacheService: IContextCacheService;
    let mockTracer: TracingService;
    let mockModel: any;
    let mockChat: any;

    beforeEach(() => {
        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
        mockBillingService = { recordUsage: vi.fn().mockResolvedValue(undefined) } as any;
        
        mockFunctionCallService = { 
            handleFunctionCalls: vi.fn().mockImplementation((response) => Promise.resolve(response)) 
        } as any;
        
        mockCacheService = { getCache: vi.fn().mockResolvedValue(null), createCache: vi.fn().mockResolvedValue(undefined) } as any;
        mockTracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as any;

        mockChat = {
            sendMessage: vi.fn()
        };

        mockModel = {
            startChat: vi.fn().mockReturnValue(mockChat),
            generateContent: vi.fn(),
            countTokens: vi.fn().mockResolvedValue({ totalTokens: 10 })
        };

        mockCoreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(mockModel),
            commonTools: [],
            commonSafetySettings: []
        } as any;

        adapter = new GeminiFlashChatAndUploadsAdapter(
            mockLogger,
            mockBillingService,
            mockCoreAdapter,
            mockFunctionCallService,
            mockCacheService,
            mockTracer
        );
    });

    it('should return start_video_stream tool call to client', async () => {
        const responseWithToolCall = {
            response: {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'I need to see the engine.' },
                            { functionCall: { name: 'start_video_stream', args: { reason: 'Inspect leaks', focusArea: 'engine_bay' } } }
                        ]
                    }
                }],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 }
            }
        };

        mockChat.sendMessage.mockResolvedValue(responseWithToolCall);

        const result = await adapter.generateReply([], 'help', 'car', null, 'user-1', 'session-1');

        expect(Array.isArray(result)).toBe(true);
        const parts = result as any[];
        expect(parts.find(p => p.type === 'tool-call' && p.toolName === 'start_video_stream')).toBeDefined();
    });

    it('should return display_content tool call to client', async () => {
        const responseWithToolCall = {
            response: {
                candidates: [{
                    content: {
                        parts: [
                            { text: 'Here is the diagram.' },
                            { functionCall: { name: 'display_content', args: { title: 'Diagram', url: 'http://img.png', type: 'image' } } }
                        ]
                    }
                }],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 }
            }
        };

        mockChat.sendMessage.mockResolvedValue(responseWithToolCall);

        const result = await adapter.generateReply([], 'show me', 'car', null, 'user-1', 'session-1');

        expect(Array.isArray(result)).toBe(true);
        const parts = result as any[];
        expect(parts.find(p => p.type === 'tool-call' && p.toolName === 'display_content')).toBeDefined();
    });
});
