import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleFunctionCalls } from '../FunctionCallHandler';
import { ChatSession, GenerateContentResponse } from '@google-cloud/vertexai';
import { ILogger, IGoogleSearchService } from '@lemonade/core';

describe('FunctionCallHandler', () => {
    let mockLogger: ILogger;
    let mockSearchService: IGoogleSearchService;
    let mockChatSession: ChatSession;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        } as any;

        mockSearchService = {
            search: vi.fn()
        } as any;

        mockChatSession = {
            sendMessage: vi.fn()
        } as any;
    });

    it('should handle google_search tool call', async () => {
        const initialResponse: GenerateContentResponse = {
            candidates: [{
                content: {
                    role: 'model',
                    parts: [{
                        functionCall: {
                            name: 'google_search',
                            args: { query: 'test query' }
                        }
                    }]
                }
            }]
        } as any;

        const searchResults = {
            results: [{ title: 'Result 1', link: 'http://test.com', snippet: 'Snippet 1' }],
            queryUsed: 'test query',
            totalFound: 1
        };

        (mockSearchService.search as any).mockResolvedValue(searchResults);
        
        const nextResponse = { candidates: [{ content: { parts: [{ text: 'Answer' }] } }] };
        (mockChatSession.sendMessage as any).mockResolvedValue({ response: nextResponse });

        const finalResponse = await handleFunctionCalls(initialResponse, mockChatSession, mockLogger, {
            searchService: mockSearchService
        });

        expect(mockSearchService.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'test query' }));
        expect(mockChatSession.sendMessage).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                functionResponse: expect.objectContaining({
                    name: 'google_search',
                    response: expect.objectContaining({
                        content: expect.objectContaining({
                            results: searchResults.results
                        })
                    })
                })
            })
        ]));
    });

    it('should return error if google_search arguments are invalid', async () => {
        const initialResponse: GenerateContentResponse = {
            candidates: [{
                content: {
                    role: 'model',
                    parts: [{
                        functionCall: {
                            name: 'google_search',
                            args: { notQuery: 'invalid' }
                        }
                    }]
                }
            }]
        } as any;

        const nextResponse = { candidates: [{ content: { parts: [{ text: 'Error handling' }] } }] };
        (mockChatSession.sendMessage as any).mockResolvedValue({ response: nextResponse });

        await handleFunctionCalls(initialResponse, mockChatSession, mockLogger, {
            searchService: mockSearchService
        });

        expect(mockChatSession.sendMessage).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                functionResponse: expect.objectContaining({
                    name: 'google_search',
                    response: expect.objectContaining({
                        content: expect.objectContaining({
                            error: expect.stringContaining('query')
                        })
                    })
                })
            })
        ]));
    });

    it('should handle verify_safe_support tool call with dummy response', async () => {
        const initialResponse: GenerateContentResponse = {
            candidates: [{
                content: {
                    role: 'model',
                    parts: [{
                        functionCall: {
                            name: 'verify_safe_support',
                            args: { reason: 'Going under car' }
                        }
                    }]
                }
            }]
        } as any;

        const nextResponse = { candidates: [{ content: { parts: [{ text: 'Safety stop' }] } }] };
        (mockChatSession.sendMessage as any).mockResolvedValue({ response: nextResponse });

        await handleFunctionCalls(initialResponse, mockChatSession, mockLogger);

        expect(mockChatSession.sendMessage).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                functionResponse: expect.objectContaining({
                    name: 'verify_safe_support',
                    response: expect.objectContaining({
                        content: expect.objectContaining({
                            safe: false,
                            status: 'verification_required'
                        })
                    })
                })
            })
        ]));
    });
});
