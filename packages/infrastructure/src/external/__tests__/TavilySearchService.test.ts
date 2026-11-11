import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TavilySearchService } from '../TavilySearchService';
import { ILogger, IBillingService } from '@lemonade/core';
import type { IConfigProvider } from '../../interfaces/IConfigProvider';

// Mock dependencies
const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
} as unknown as ILogger;

const mockBillingService = {
    recordUsage: vi.fn().mockResolvedValue(undefined),
} as unknown as IBillingService;

const mockConfigProvider = {
    getOrThrow: vi.fn(() => 'test-api-key'),
} as unknown as IConfigProvider;

function tavilyResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'Test Result 1',
        url: 'https://test1.com/tsb-123',
        content: 'Snippet 1',
        score: 0.9,
        raw_content: '# TSB 123\nFull page content here.',
        published_date: '2023-10-27T10:00:00Z',
        ...overrides,
    };
}

describe('TavilySearchService', () => {
    let service: TavilySearchService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TavilySearchService(mockLogger, mockBillingService, mockConfigProvider);
        global.fetch = vi.fn();
    });

    it('should return search results mapped from Tavily on success', async () => {
        const mockResponse = {
            ok: true,
            json: () =>
                Promise.resolve({
                    query: 'test query',
                    results: [tavilyResult()],
                }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const result = await service.search({
            query: 'test query',
            limit: 1,
            userId: 'user-123',
            sessionId: 'session-456',
        });

        expect(result.results).toHaveLength(1);
        expect(result.results[0].title).toBe('Test Result 1');
        expect(result.results[0].link).toBe('https://test1.com/tsb-123');
        expect(result.results[0].snippet).toBe('Snippet 1');
        expect(result.results[0].source).toBe('test1.com');
        expect(result.results[0].date).toBe('2023-10-27T10:00:00Z');
        expect(result.results[0].content).toBe('# TSB 123\nFull page content here.');
        expect(result.totalFound).toBe(1);
        expect(mockBillingService.recordUsage).toHaveBeenCalled();
    });

    it('should send a basic search with extracted page content to Tavily', async () => {
        const mockResponse = {
            ok: true,
            json: () => Promise.resolve({ query: '2022 Ford F-150 brake squeak TSB', results: [] }),
        };
        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const query = '2022 Ford F-150 brake squeak TSB';
        await service.search({ query, limit: 3 });

        expect(global.fetch).toHaveBeenCalledWith(
            'https://api.tavily.com/search',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer test-api-key',
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                    query,
                    search_depth: 'basic',
                    max_results: 3,
                    include_answer: false,
                    include_raw_content: 'markdown',
                }),
            }),
        );
    });

    it('should read only the Tavily API key from config', async () => {
        const mockResponse = {
            ok: true,
            json: () => Promise.resolve({ query: 'test', results: [] }),
        };
        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        await service.search({ query: 'test', limit: 3 });

        expect(mockConfigProvider.getOrThrow).toHaveBeenCalledWith('TAVILY_API_KEY');
        expect(mockConfigProvider.getOrThrow).toHaveBeenCalledTimes(1);
    });

    it('should return empty results if Tavily returns no results', async () => {
        const mockResponse = {
            ok: true,
            json: () => Promise.resolve({}),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const result = await service.search({ query: 'empty query', limit: 3 });

        expect(result.results).toHaveLength(0);
        expect(result.totalFound).toBe(0);
    });

    it('should omit content when Tavily returns no raw content', async () => {
        const mockResponse = {
            ok: true,
            json: () =>
                Promise.resolve({
                    query: 'test query',
                    results: [tavilyResult({ raw_content: null })],
                }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const result = await service.search({ query: 'test query', limit: 1 });

        expect(result.results).toHaveLength(1);
        expect(result.results[0].content).toBeUndefined();
        expect(result.results[0].snippet).toBe('Snippet 1');
    });

    it('should truncate extracted page content to the per-result cap', async () => {
        const longContent = 'x'.repeat(5000);
        const mockResponse = {
            ok: true,
            json: () =>
                Promise.resolve({
                    query: 'test query',
                    results: [tavilyResult({ raw_content: longContent })],
                }),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        const result = await service.search({ query: 'test query', limit: 1 });

        expect(result.results[0].content).toHaveLength(4000);
    });

    it('should throw error on fetch failure', async () => {
        vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

        await expect(service.search({ query: 'test', limit: 1 })).rejects.toThrow('Tavily Search Request Failed');

        expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error on a non-OK Tavily response', async () => {
        const mockResponse = {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: () => Promise.resolve('Invalid API key'),
        };

        vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

        await expect(service.search({ query: 'test', limit: 1 })).rejects.toThrow('Tavily Search Failed: Unauthorized');

        expect(mockLogger.error).toHaveBeenCalled();
    });
});
