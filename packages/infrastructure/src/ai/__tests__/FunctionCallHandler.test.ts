import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionCallService } from '../FunctionCallHandler';
import { ILogger, IGoogleSearchService } from '@lemonade/core';
import { TracingService } from '../../observability/TracingService';

describe('FunctionCallService', () => {
    let service: FunctionCallService;
    let mockLogger: ILogger;
    let mockSearchService: IGoogleSearchService;
    let mockTracer: TracingService;
    let mockChatSession: any;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
        } as any;

        mockSearchService = {
            search: vi.fn().mockResolvedValue({ results: [{ title: 'Test Result' }] }),
        } as any;

        mockTracer = {
            traceAiCall: vi.fn().mockImplementation(({ exec }) => exec()),
        } as any;

        mockChatSession = {
            sendMessage: vi.fn(),
        };

        service = new FunctionCallService(mockLogger, mockSearchService, mockTracer);
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
        } as any;

        const nextResponse = {
            candidates: [{
                content: {
                    parts: [{ text: 'Final Answer' }]
                }
            }]
        } as any;

        mockChatSession.sendMessage.mockResolvedValue({ response: nextResponse });

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
        } as any;

        const nextResponse = {
            candidates: [{
                content: { parts: [{ text: 'Error handled' }] }
            }]
        } as any;

        mockChatSession.sendMessage.mockResolvedValue({ response: nextResponse });

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
        } as any;

        const nextResponse = {
            candidates: [{
                content: { parts: [{ text: 'Safe check' }] }
            }]
        } as any;

        mockChatSession.sendMessage.mockResolvedValue({ response: nextResponse });

        await service.handleFunctionCalls(initialResponse, mockChatSession, { userId: 'u1', sessionId: 's1' });

        expect(mockChatSession.sendMessage).toHaveBeenCalled();
    });
});