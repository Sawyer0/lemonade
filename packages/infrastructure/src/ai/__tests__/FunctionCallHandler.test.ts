import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionCallService } from '../FunctionCallHandler';
import { ILogger, IGoogleSearchService, IMemoryService } from '@lemonade/core';
import { TracingService } from '../../observability/TracingService';
import { ChatSession, GenerateContentResponse } from '@google-cloud/vertexai';

describe('FunctionCallService', () => {
    let service: FunctionCallService;
    let mockLogger: ILogger;
    let mockSearchService: IGoogleSearchService;
    let mockMemoryService: IMemoryService;
    let mockTracer: TracingService;
    let mockChatSession: ChatSession;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as unknown as ILogger;

        mockSearchService = {
            search: vi.fn().mockResolvedValue({ results: [{ title: 'Test Result' }] }),
        } as unknown as IGoogleSearchService;

        mockMemoryService = {
            addDocument: vi.fn().mockResolvedValue(undefined),
            search: vi.fn().mockResolvedValue([])
        } as unknown as IMemoryService;

        mockTracer = {
            traceAiCall: vi.fn().mockImplementation(({ exec }) => exec()),
        } as unknown as TracingService;

        mockChatSession = {
            sendMessage: vi.fn(),
        } as unknown as ChatSession;

        service = new FunctionCallService(mockLogger, mockSearchService, mockMemoryService, mockTracer);
    });

    it('should handle google_search tool call', async () => {
        const initialResponse = {
            candidates: [{
                content: {
                    parts: [{
                        functionCall: {
                            name: 'google_search',
                            args: { query: 'test query' }
                        }
                    }]
                }
            }]
        } as unknown as GenerateContentResponse;

        const nextResponse = {
            candidates: [{
                content: {
                    parts: [{ text: 'Final Answer' }]
                }
            }]
        } as unknown as GenerateContentResponse;

        (mockChatSession.sendMessage as jest.Mock).mockResolvedValue({ response: nextResponse });

        const result = await service.handleFunctionCalls(initialResponse, mockChatSession, { userId: 'u1', sessionId: 's1' });

        expect(mockSearchService.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'test query' }));
        expect(mockChatSession.sendMessage).toHaveBeenCalled();
        expect(result).toBe(nextResponse);
    });

    it('should return error if google_search arguments are invalid', async () => {
        const initialResponse = {
            candidates: [{
                content: {
                    parts: [{
                        functionCall: {
                            name: 'google_search',
                            args: { invalid: 'args' }
                        }
                    }]
                }
            }]
        } as unknown as GenerateContentResponse;

        const nextResponse = {
            candidates: [{
                content: { parts: [{ text: 'Error handled' }] }
            }]
        } as unknown as GenerateContentResponse;

        (mockChatSession.sendMessage as jest.Mock).mockResolvedValue({ response: nextResponse });

        await service.handleFunctionCalls(initialResponse, mockChatSession, { userId: 'u1', sessionId: 's1' });

        expect(mockChatSession.sendMessage).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                functionResponse: expect.objectContaining({
                    response: expect.objectContaining({
                        content: expect.objectContaining({ error: expect.any(String) })
                    })
                })
            })
        ]));
    });

    it('should handle verify_safe_support tool call', async () => {
        const initialResponse = {
            candidates: [{
                content: {
                    parts: [{
                        functionCall: {
                            name: 'verify_safe_support',
                            args: { reason: 'check' }
                        }
                    }]
                }
            }]
        } as unknown as GenerateContentResponse;

        const nextResponse = {
            candidates: [{
                content: { parts: [{ text: 'Safe check' }] }
            }]
        } as unknown as GenerateContentResponse;

        (mockChatSession.sendMessage as jest.Mock).mockResolvedValue({ response: nextResponse });

        await service.handleFunctionCalls(initialResponse, mockChatSession, { userId: 'u1', sessionId: 's1' });

        expect(mockChatSession.sendMessage).toHaveBeenCalled();
    });
});