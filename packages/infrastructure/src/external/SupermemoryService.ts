import { injectable, inject } from 'inversify';
import { IMemoryService, MemorySearchOptions, MemorySearchResult, type ILogger } from '@lemonade/core';
import { TYPES } from '../di/types';
import type { IConfigProvider } from '../interfaces/IConfigProvider';

@injectable()
export class SupermemoryService implements IMemoryService {
    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.ConfigProvider) private config: IConfigProvider
    ) { }

    async addDocument(content: string, tags?: string[], spaceId?: string): Promise<void> {
        const config = this.config.getSupermemoryConfig();
        const targetSpace = spaceId || config.SPACE_ID;

        this.logger.debug('Supermemory: addDocument called', { tags, targetSpace });

        const response = await fetch('https://api.supermemory.ai/v3/documents', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content,
                tags: tags || [],
                spaceId: targetSpace
            })
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error('Supermemory API Error (Add)', new Error(response.statusText), { status: response.status, error });
            throw new Error(`Supermemory API error: ${response.statusText}`);
        }
    }

    async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
        const config = this.config.getSupermemoryConfig();
        const targetSpace = options?.spaceId || config.SPACE_ID;

        this.logger.debug('Supermemory: search called', { query, targetSpace });

        const response = await fetch('https://api.supermemory.ai/v3/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query,
                spaceId: targetSpace,
                top_k: options?.limit || 3
            })
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error('Supermemory API Error (Search)', new Error(response.statusText), { status: response.status, error });
            throw new Error(`Supermemory API error: ${response.statusText}`);
        }

        const data = await response.json() as { results: { content: string; metadata: Record<string, unknown> }[] };
        return data.results.map(r => ({
            content: r.content,
            metadata: r.metadata
        }));
    }
}
