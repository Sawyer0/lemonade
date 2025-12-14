import { injectable, inject } from 'inversify';
import { VertexAI } from '@google-cloud/vertexai';

import { CONFIG } from '@/infrastructure/config';
import { IContextCacheService, ILogger, AppError, ErrorCode, CachePart } from '@lemonade/core';
import { TYPES } from '@/infrastructure/di/types';

@injectable()
export class ContextCacheService implements IContextCacheService {
    private vertex: VertexAI;
    private logger: ILogger;

    constructor(@inject(TYPES.Logger) logger: ILogger) {
        this.logger = logger;

        const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        let credentials = {};
        if (key) {
            try {
                credentials = JSON.parse(key);
            } catch (error) {
                this.logger.error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY', error);
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Invalid FIREBASE_SERVICE_ACCOUNT_KEY: Failed to parse JSON');
            }
        }
        this.vertex = new VertexAI({
            project: CONFIG.GCLOUD.PROJECT_ID,
            location: 'us',
            googleAuthOptions: { credentials }
        });
    }

    private get cacheManager() {
        const manager = this.vertex.preview.cachedContents;
        if (!manager) {
            throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Vertex AI CachedContents manager not available');
        }
        return manager;
    }

    async createCache(parts: import('@/core/interfaces/IContextCacheService').CachePart[], ttlSeconds: number = 3600, displayName?: string): Promise<string> {
        try {
            this.logger.info('Creating Context Cache', { ttlSeconds, partsCount: parts.length, displayName });

            const modelName = CONFIG.AI_MODELS.CHAT_MODEL;

            const contents = [
                {
                    role: 'user',
                    parts: parts.map(p => {
                        if (p.text) return { text: p.text };
                        if (p.fileData) return { fileData: p.fileData };
                        return { text: '' };
                    })
                }
            ];

            const cacheConfig: Record<string, unknown> = {
                model: modelName,
                contents: contents,
                ttl: `${ttlSeconds}s`,
            };

            if (displayName) {
                cacheConfig.displayName = displayName;
            }

            const response = await this.cacheManager.create(cacheConfig);

            this.logger.info('Context Cache Created', {
                name: response.name,
                displayName: response.displayName,
                expireTime: response.expireTime
            });

            if (!response.name) {
                throw new AppError(ErrorCode.AI_SERVICE_ERROR, "Failed to create cache: No resource name returned");
            }

            return response.name;
        } catch (error) {
            this.logger.error('Failed to create context cache', error);
            throw new AppError(ErrorCode.AI_SERVICE_ERROR, "Context caching failed");
        }
    }

    async getCache(cacheName: string): Promise<unknown> {
        try {
            this.logger.info('Getting Context Cache', { cacheName });
            return await this.cacheManager.get(cacheName);
        } catch (error) {
            this.logger.error('Failed to get Context Cache', error, { cacheName });
            throw error;
        }
    }

    async updateCache(cacheName: string, ttlSeconds: number): Promise<void> {
        try {
            this.logger.info('Updating Context Cache TTL', { cacheName, ttlSeconds });

            await this.cacheManager.update({
                name: cacheName,
                ttl: `${ttlSeconds}s`
            }, ['ttl']);

            this.logger.info('Context Cache Updated Successfully', { cacheName });
        } catch (error) {
            this.logger.error('Failed to update Context Cache', error, { cacheName });
            throw error;
        }
    }

    async deleteCache(cacheName: string): Promise<void> {
        try {
            this.logger.info('Deleting Context Cache', { cacheName });
            await this.cacheManager.delete(cacheName);
            this.logger.info('Context Cache Deleted Successfully', { cacheName });
        } catch (error) {
            this.logger.error('Failed to delete Context Cache', error, { cacheName });
            throw error;
        }
    }

    async listCaches(): Promise<unknown[]> {
        try {
            this.logger.info('Listing Context Caches');
            const result = await this.cacheManager.list();
            
            const safeResult = result as { cachedContents?: unknown[] } | unknown[];
            if (Array.isArray(safeResult)) {
                return safeResult;
            }
            return (safeResult as { cachedContents?: unknown[] }).cachedContents || [];
        } catch (error) {
            this.logger.error('Failed to list Context Caches', error);
            throw error;
        }
    }

    async findCacheByDisplayName(displayName: string): Promise<string | null> {
        try {
            const caches = await this.listCaches();
            // Match against Vertex AI Cache Object structure
            const match = caches.find((c: any) => c.displayName === displayName);

            if (match) {
                const cachedContent = match as any;
                this.logger.info('Found existing cache by display name', { displayName, cacheName: cachedContent.name });
                return cachedContent.name;
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to find cache by display name', error, { displayName });
            return null;
        }
    }
}
