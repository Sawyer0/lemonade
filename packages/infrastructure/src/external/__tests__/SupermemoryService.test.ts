import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ILogger } from '@lemonade/core';
import { SupermemoryService } from '../SupermemoryService';
import type { IConfigProvider } from '../../../interfaces/IConfigProvider';

describe('SupermemoryService', () => {
    let service: SupermemoryService;
    let mockLogger: ILogger;
    let mockConfig: IConfigProvider;

    beforeEach(() => {
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        } as unknown as ILogger;

        mockConfig = {
            getFirebaseConfig: vi.fn(),
            getGoogleCloudConfig: vi.fn(),
            getGeminiModel: vi.fn(),
            getSupermemoryConfig: vi.fn().mockReturnValue({
                API_KEY: 'test-key',
                SPACE_ID: 'test-space'
            })
        } as unknown as IConfigProvider;

        service = new SupermemoryService(mockLogger, mockConfig);
        
        // Mock global fetch
        global.fetch = vi.fn();
    });

    it('should call Supermemory API to add a document', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ status: 'success' })
        } as unknown as Response);

        await service.addDocument({ content: 'test content', tags: ['tag1'] }, 'custom-space');

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('api.supermemory.ai/v3/documents'),
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: 'test content',
                    tags: ['tag1'],
                    spaceId: 'custom-space'
                })
            })
        );
    });

    it('should call Supermemory API to search using v4', async () => {
        const mockResponse = {
            results: [
                { content: 'result 1', metadata: {}, score: 0.9 }
            ]
        };
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        } as unknown as Response);

        const results = await service.search('test query', { spaceId: 'test-space', includeForgotten: true, tags: ['tag1'] });

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('api.supermemory.ai/v4/search'),
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: 'test query',
                    spaceId: 'test-space',
                    top_k: 3,
                    include: {
                        forgottenMemories: true
                    },
                    filters: [],
                    tags: ['tag1']
                })
            })
        );
        expect(results).toEqual(mockResponse.results);
    });

    it('should log an error if API call fails', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: async () => 'Unauthorized access'
        } as unknown as Response);

        await expect(service.addDocument({ content: 'test' })).rejects.toThrow('Supermemory API error: Unauthorized');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
