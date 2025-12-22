import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupermemoryService } from '../SupermemoryService';
import { ILogger } from '@lemonade/core';
import { IConfigProvider } from '../../../interfaces/IConfigProvider';

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
        } as any;

        mockConfig = {
            getFirebaseConfig: vi.fn(),
            getGoogleCloudConfig: vi.fn(),
            getGeminiModel: vi.fn(),
            getSupermemoryConfig: vi.fn().mockReturnValue({
                API_KEY: 'test-key',
                SPACE_ID: 'test-space'
            })
        } as any;

        service = new SupermemoryService(mockLogger, mockConfig);
        
        // Mock global fetch
        global.fetch = vi.fn();
    });

    it('should call Supermemory API to add a document', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ success: true })
        });

        await service.addDocument('test content', ['tag1'], 'custom-space');

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('supermemory.ai/api/v1/add'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer test-key',
                    'Content-Type': 'application/json'
                }),
                body: expect.stringContaining('test content')
            })
        );
    });

    it('should call Supermemory API to search', async () => {
        const mockResults = [
            { content: 'result 1', metadata: { source: 'history' } }
        ];
        
        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => ({ results: mockResults })
        });

        const results = await service.search('test query', { spaceId: 'test-space' });

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('supermemory.ai/api/v1/search'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('test query')
            })
        );
        expect(results).toEqual(mockResults);
    });

    it('should log an error if API call fails', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            text: async () => 'Unauthorized access'
        });

        await expect(service.addDocument('test')).rejects.toThrow('Supermemory API error: Unauthorized');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
