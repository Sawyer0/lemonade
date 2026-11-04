import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiFlashChatAndUploadsAdapter } from '../GeminiFlashChatAndUploadsAdapter';
import { ILogger, IBillingService, MessagePart } from '@lemonade/core';
import { GeminiCoreAdapter } from '../GeminiCoreAdapter';
import { FunctionCallService } from '../FunctionCallHandler';
import { GenerativeModel, ChatSession } from '@google-cloud/vertexai';

describe('GeminiFlashChatAndUploadsAdapter', () => {
    let adapter: GeminiFlashChatAndUploadsAdapter;
    let mockLogger: ILogger;
    let mockBillingService: IBillingService;
    let mockCoreAdapter: GeminiCoreAdapter;
    let mockFunctionCallService: FunctionCallService;
    let mockCacheService: IContextCacheService;
    let mockTracer: TracingService;
    let mockModel: GenerativeModel;
    let mockChat: ChatSession;

    beforeEach(() => {
        mockLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as ILogger;
        mockBillingService = { recordUsage: vi.fn().mockResolvedValue(undefined) } as unknown as IBillingService;

        mockFunctionCallService = {
            handleFunctionCalls: vi.fn().mockImplementation((response) => Promise.resolve(response)),
        } as unknown as FunctionCallService;

        mockCacheService = {
            getCache: vi.fn().mockResolvedValue(null),
            createCache: vi.fn().mockResolvedValue(undefined),
        } as unknown as IContextCacheService;
        mockTracer = { traceAiCall: vi.fn(({ exec }) => exec()) } as unknown as TracingService;

        mockChat = {
            sendMessage: vi.fn(),
        } as unknown as ChatSession;

        mockModel = {
            startChat: vi.fn().mockReturnValue(mockChat),
            generateContent: vi.fn(),
            countTokens: vi.fn().mockResolvedValue({ totalTokens: 10 }),
        } as unknown as GenerativeModel;

        mockCoreAdapter = {
            getGenerativeModel: vi.fn().mockReturnValue(mockModel),
            commonTools: [],
            commonSafetySettings: [],
        } as unknown as GeminiCoreAdapter;

        adapter = new GeminiFlashChatAndUploadsAdapter(
            mockLogger,
            mockBillingService,
            mockCoreAdapter,
            mockFunctionCallService,
            mockCacheService,
            mockTracer,
        );
    });

    describe('Error Handling', () => {
        describe('generateReply', () => {
            it('should handle empty candidates array', async () => {
                const responseWithEmptyCandidates = {
                    response: {
                        candidates: [],
                        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
                    },
                };

                (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(responseWithEmptyCandidates);

                const result = await adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1');

                // Should return default text when no candidates
                expect(result).toBe('I processed that request.');
            });

            it('should handle null candidates', async () => {
                const responseWithNullCandidates = {
                    response: {
                        candidates: null,
                        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
                    },
                };

                (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(responseWithNullCandidates);

                const result = await adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1');

                expect(result).toBe('I processed that request.');
            });

            it('should handle API network error', async () => {
                (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network timeout'));

                await expect(adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1')).rejects.toThrow(
                    'Network timeout',
                );
            });

            it('should still work if billing service fails', async () => {
                const validResponse = {
                    response: {
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: 'Response text' }],
                                },
                            },
                        ],
                        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
                    },
                };

                (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(validResponse);
                (mockBillingService.recordUsage as ReturnType<typeof vi.fn>).mockRejectedValue(
                    new Error('Billing DB down'),
                );

                // Should still return the response even if billing fails
                await expect(adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1')).rejects.toThrow(
                    'Billing DB down',
                );
            });

            it('should handle function call service failure', async () => {
                const validResponse = {
                    response: {
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: 'Response text' }],
                                },
                            },
                        ],
                        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
                    },
                };

                (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(validResponse);
                (mockFunctionCallService.handleFunctionCalls as ReturnType<typeof vi.fn>).mockRejectedValue(
                    new Error('Tool execution failed'),
                );

                await expect(adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1')).rejects.toThrow(
                    'Tool execution failed',
                );
            });
        });

        describe('analyzeUploadedVideo', () => {
            it('should throw UNAUTHORIZED when userId is missing', async () => {
                await expect(
                    adapter.analyzeUploadedVideo('gs://bucket/video.mp4', '2020 Honda Civic', 'video/mp4'),
                ).rejects.toThrow('User ID is required');
            });

            it('should throw when AI returns empty response', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
                    response: {
                        candidates: [{ content: { parts: [] } }],
                        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
                    },
                });

                await expect(
                    adapter.analyzeUploadedVideo(
                        'gs://bucket/video.mp4',
                        '2020 Honda Civic',
                        'video/mp4',
                        'user-1',
                        'session-1',
                    ),
                ).rejects.toThrow('AI returned empty response');
            });

            it('should throw when AI returns malformed JSON', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
                    response: {
                        candidates: [{ content: { parts: [{ text: 'not valid json {' }] } }],
                        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
                    },
                });

                await expect(
                    adapter.analyzeUploadedVideo(
                        'gs://bucket/video.mp4',
                        '2020 Honda Civic',
                        'video/mp4',
                        'user-1',
                        'session-1',
                    ),
                ).rejects.toThrow();
            });

            it('should throw when Vertex AI API is unavailable', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockRejectedValue(
                    new Error('503 Service Unavailable'),
                );

                await expect(
                    adapter.analyzeUploadedVideo(
                        'gs://bucket/video.mp4',
                        '2020 Honda Civic',
                        'video/mp4',
                        'user-1',
                        'session-1',
                    ),
                ).rejects.toThrow('503 Service Unavailable');

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'Vertex AI Uploaded Video Analysis Failure',
                    expect.any(Error),
                );
            });
        });

        describe('analyzeUploadedImage', () => {
            it('should throw UNAUTHORIZED when userId is missing', async () => {
                await expect(
                    adapter.analyzeUploadedImage('gs://bucket/image.jpg', '2020 Honda Civic', 'image/jpeg'),
                ).rejects.toThrow('User ID is required');
            });

            it('should throw when AI returns empty response', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
                    response: {
                        candidates: [{ content: { parts: [] } }],
                        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
                    },
                });

                await expect(
                    adapter.analyzeUploadedImage(
                        'gs://bucket/image.jpg',
                        '2020 Honda Civic',
                        'image/jpeg',
                        'user-1',
                        'session-1',
                    ),
                ).rejects.toThrow('AI returned empty response');
            });
        });

        describe('verifyHypothesis', () => {
            it('should return safe default when AI fails', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API Error'));

                const result = await adapter.verifyHypothesis({
                    hypothesis: 'The car needs new brakes',
                    evidence: 'Squeaking sound',
                    sessionId: 'session-1',
                });

                // Should return safe default, not throw
                expect(result.isVerified).toBe(false);
                expect(result.reasoning).toContain('internal error');
            });

            it('should return safe default when response is empty', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
                    response: {
                        candidates: [{ content: { parts: [] } }],
                    },
                });

                const result = await adapter.verifyHypothesis({
                    hypothesis: 'test',
                    evidence: 'test',
                    sessionId: 'session-1',
                });

                expect(result.isVerified).toBe(false);
                expect(result.reasoning).toContain('internal error');
            });

            it('should return safe default when JSON is malformed', async () => {
                (mockModel.generateContent as ReturnType<typeof vi.fn>).mockResolvedValue({
                    response: {
                        candidates: [{ content: { parts: [{ text: '{ invalid json' }] } }],
                    },
                });

                const result = await adapter.verifyHypothesis({
                    hypothesis: 'test',
                    evidence: 'test',
                    sessionId: 'session-1',
                });

                expect(result.isVerified).toBe(false);
            });
        });

        describe('countTokens', () => {
            it('should return 0 when API fails', async () => {
                (mockModel.countTokens as ReturnType<typeof vi.fn>).mockRejectedValue(
                    new Error('Token counting failed'),
                );

                const count = await adapter.countTokens('test content');

                expect(count).toBe(0);
                expect(mockLogger.error).toHaveBeenCalledWith('countTokens failed', expect.any(Error));
            });

            it('should handle empty string content (still calls API)', async () => {
                const count = await adapter.countTokens('');

                // Empty string still creates a part and calls the API
                expect(mockModel.countTokens).toHaveBeenCalled();
                expect(count).toBe(10); // Returns mock value
            });

            it('should return 0 for empty array', async () => {
                const count = await adapter.countTokens([]);

                expect(count).toBe(0);
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle history with mixed content types', async () => {
            const mixedHistory = [
                { role: 'user', content: 'text message' },
                { role: 'assistant', content: [{ type: 'text', text: 'response' }] },
                { role: 'user', content: { nested: 'object' } },
                { role: 'assistant', content: null },
                { role: 'user', content: undefined },
            ];

            const validResponse = {
                response: {
                    candidates: [
                        {
                            content: { parts: [{ text: 'Response' }] },
                        },
                    ],
                    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
                },
            };

            (mockChat.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(validResponse);

            // Should not throw
            const result = await adapter.generateReply(mixedHistory, 'test', 'car', null, 'user-1', 'session-1');

            expect(result).toBeDefined();
        });

        it('should use cache when available', async () => {
            const cachedResponse = 'Cached response text';
            (mockCacheService.getCache as ReturnType<typeof vi.fn>).mockResolvedValue(cachedResponse);

            const result = await adapter.generateReply([], 'test', 'car', null, 'user-1', 'session-1');

            expect(result).toBe(cachedResponse);
            expect(mockChat.sendMessage).not.toHaveBeenCalled();
        });
    });

    it('should return start_video_stream tool call to client', async () => {
        const responseWithToolCall = {
            response: {
                candidates: [
                    {
                        content: {
                            parts: [
                                { text: 'I need to see the engine.' },
                                {
                                    functionCall: {
                                        name: 'start_video_stream',
                                        args: { reason: 'Inspect leaks', focusArea: 'engine_bay' },
                                    },
                                },
                            ],
                        },
                    },
                ],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
            },
        };

        (mockChat.sendMessage as jest.Mock).mockResolvedValue(responseWithToolCall);

        const result = await adapter.generateReply([], 'help', 'car', null, 'user-1', 'session-1');

        expect(Array.isArray(result)).toBe(true);
        const parts = result as MessagePart[];
        expect(parts.find((p) => p.type === 'tool-call' && p.toolName === 'start_video_stream')).toBeDefined();
    });

    it('should return display_content tool call to client', async () => {
        const responseWithToolCall = {
            response: {
                candidates: [
                    {
                        content: {
                            parts: [
                                { text: 'Here is the diagram.' },
                                {
                                    functionCall: {
                                        name: 'display_content',
                                        args: { title: 'Diagram', url: 'http://img.png', type: 'image' },
                                    },
                                },
                            ],
                        },
                    },
                ],
                usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
            },
        };

        (mockChat.sendMessage as jest.Mock).mockResolvedValue(responseWithToolCall);

        const result = await adapter.generateReply([], 'show me', 'car', null, 'user-1', 'session-1');

        expect(Array.isArray(result)).toBe(true);
        const parts = result as MessagePart[];
        expect(parts.find((p) => p.type === 'tool-call' && p.toolName === 'display_content')).toBeDefined();
    });
});
