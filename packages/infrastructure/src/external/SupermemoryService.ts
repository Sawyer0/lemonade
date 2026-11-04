import { injectable, inject } from 'inversify';
import { IMemoryService, MemorySearchOptions, MemorySearchResult, MemoryDocument, type ILogger } from '@lemonade/core';
import { TYPES } from '../di/types';
import type { IConfigProvider } from '../interfaces/IConfigProvider';

@injectable()
export class SupermemoryService implements IMemoryService {
    constructor(
        @inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.ConfigProvider) private config: IConfigProvider,
    ) {}

    async addDocument(doc: MemoryDocument, spaceId?: string): Promise<void> {
        const config = this.config.getSupermemoryConfig();
        const targetSpace = spaceId || config.SPACE_ID;

        this.logger.debug('Supermemory: addDocument called', { tags: doc.tags, targetSpace });

        const response = await fetch('https://api.supermemory.ai/v3/documents', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...doc,
                spaceId: targetSpace,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error('Supermemory API Error (Add)', new Error(response.statusText), {
                status: response.status,
                error,
            });
            throw new Error(`Supermemory API error: ${response.statusText}`);
        }
    }

    async search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]> {
        const config = this.config.getSupermemoryConfig();
        const targetSpace = options?.spaceId || config.SPACE_ID;

        this.logger.debug('Supermemory: v4 search called', { query, targetSpace, options });

        const response = await fetch('https://api.supermemory.ai/v4/search', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query,
                spaceId: targetSpace,
                top_k: options?.limit || 3,
                include: {
                    forgottenMemories: !!options?.includeForgotten,
                },
                filters: options?.filters || [],
                tags: options?.tags || [],
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            this.logger.error('Supermemory API Error (v4 Search)', new Error(response.statusText), {
                status: response.status,
                error,
            });
            throw new Error(`Supermemory API error: ${response.statusText}`);
        }

        const data = (await response.json()) as {
            results: { content: string; metadata: Record<string, unknown>; score?: number }[];
        };
        return data.results.map((r) => ({
            content: r.content,
            metadata: r.metadata,
            score: r.score,
        }));
    }
}
