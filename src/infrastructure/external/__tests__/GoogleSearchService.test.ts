import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleSearchService } from '../GoogleSearchService';
import { ILogger, IBillingService } from '@lemonade/core';

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

// Mock CONFIG
vi.mock('@/infrastructure/config', () => ({
  CONFIG: {
    GOOGLE: {
      SEARCH_API_KEY: 'test-api-key',
      SEARCH_CX: 'test-cx',
    },
  },
}));

describe('GoogleSearchService', () => {
  let service: GoogleSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new GoogleSearchService(mockLogger, mockBillingService);
    global.fetch = vi.fn();
  });

  it('should return search results on success', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        items: [
          {
            title: 'Test Result 1',
            link: 'https://test1.com',
            snippet: 'Snippet 1',
            displayLink: 'test1.com',
            pagemap: {
              metatags: [{
                'article:published_time': '2023-10-27T10:00:00Z'
              }]
            }
          }
        ],
        searchInformation: {
          totalResults: '1'
        }
      }),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await service.search({
      limit: 1,
      userId: 'user-123',
      sessionId: 'session-456'
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Test Result 1');
    expect(result.results[0].date).toBe('2023-10-27T10:00:00Z');
    expect(result.totalFound).toBe(1);
    expect(mockBillingService.recordUsage).toHaveBeenCalled();
  });

  it('should return empty results if no items found', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({}),
    };

    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await service.search({ query: 'empty query', limit: 3 });

    expect(result.results).toHaveLength(0);
    expect(result.totalFound).toBe(0);
  });

  it('should throw error on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

    await expect(service.search({ query: 'test', limit: 1 }))
      .rejects.toThrow('Google Search Request Failed');
    
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('should construct the correct URL for TSB searches', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

    const query = '2022 Ford F-150 brake squeak TSB';
    await service.search({ query, limit: 3 });

    const expectedUrl = `https://www.googleapis.com/customsearch/v1?key=test-api-key&cx=test-cx&q=${encodeURIComponent(query)}&num=3`;
    expect(global.fetch).toHaveBeenCalledWith(expectedUrl);
  });
});

