import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container } from 'inversify';
import { 
    IMemoryService, 
    ILogger
} from '@lemonade/core';
import { FunctionCallService, FunctionCallContext } from '../../ai/FunctionCallHandler';
import { TYPES } from '../../di/types';
import { GenerateContentResponse, ChatSession } from '@google-cloud/vertexai';

describe('Supermemory Integration', () => {
    let container: Container;
    let mockMemory: IMemoryService;
    let mockLogger: ILogger;
    let functionCallService: FunctionCallService;

    beforeEach(() => {
        mockMemory = {
            addDocument: vi.fn().mockResolvedValue(undefined),
            search: vi.fn().mockResolvedValue([])
        } as unknown as IMemoryService;

        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        } as unknown as ILogger;

        container = new Container();
        container.bind<IMemoryService>(TYPES.SupermemoryService).toConstantValue(mockMemory);
        container.bind<ILogger>(TYPES.Logger).toConstantValue(mockLogger);
        container.bind(TYPES.GoogleSearchService).toConstantValue({});
        container.bind(TYPES.TracingService).toConstantValue({
            traceAiCall: vi.fn().mockImplementation(({ exec }) => exec())
        });
        container.bind(FunctionCallService).to(FunctionCallService);

        functionCallService = container.get(FunctionCallService);
    });

    describe('save_to_memory tool', () => {
        it('should call memory service with correct isolation tags', async () => {
            const context: FunctionCallContext = {
                userId: 'user-123',
                sessionId: 'session-456',
                vin: 'VIN123'
            };

            const initialResponse = {
                candidates: [{
                    content: {
                        parts: [{
                            functionCall: {
                                name: 'save_to_memory',
                                args: {
                                    content: 'Found a leak in the water pump.',
                                    reason: 'Verified component failure',
                                    tags: ['water-pump', 'leak']
                                }
                            }
                        }]
                    }
                }]
            } as unknown as GenerateContentResponse;

            const mockChatSession = {
                sendMessage: vi.fn().mockResolvedValue({ response: { candidates: [] } })
            } as unknown as ChatSession;

            await functionCallService.handleFunctionCalls(initialResponse, mockChatSession, context);

            expect(mockMemory.addDocument).toHaveBeenCalledWith(expect.objectContaining({
                content: 'Found a leak in the water pump.',
                tags: expect.arrayContaining([
                    'user:user-123',
                    'vin:VIN123',
                    'water-pump',
                    'leak'
                ]),
                metadata: expect.objectContaining({
                    reason: 'Verified component failure',
                    sessionId: 'session-456'
                })
            }));
        });

        it('should handle multimedia URLs in save_to_memory', async () => {
            const context: FunctionCallContext = {
                userId: 'user-123',
                sessionId: 'session-456'
            };

            const initialResponse = {
                candidates: [{
                    content: {
                        parts: [{
                            functionCall: {
                                name: 'save_to_memory',
                                args: {
                                    url: 'https://example.com/image.jpg',
                                    reason: 'Photo of the damaged belt'
                                }
                            }
                        }]
                    }
                }]
            } as unknown as GenerateContentResponse;

            const mockChatSession = {
                sendMessage: vi.fn().mockResolvedValue({ response: { candidates: [] } })
            } as unknown as ChatSession;

            await functionCallService.handleFunctionCalls(initialResponse, mockChatSession, context);

            expect(mockMemory.addDocument).toHaveBeenCalledWith(expect.objectContaining({
                url: 'https://example.com/image.jpg',
                metadata: expect.objectContaining({
                    reason: 'Photo of the damaged belt'
                })
            }));
        });
    });
});
