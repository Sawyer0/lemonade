import { injectable, inject } from 'inversify';
import { VertexAI } from '@google-cloud/vertexai';

import { CONFIG } from '@/infrastructure/config';
import { IContextCacheService } from '@/core/interfaces/IContextCacheService';
import { TYPES } from '@/infrastructure/di/types';
import type { ILogger } from '@/core/interfaces/ILogger';
import { AppError } from '@/core/errors/AppError';
import { ErrorCode } from '@/core/errors/codes';

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
                // Log the critical error before throwing
                this.logger.error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY', error);
                throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Invalid FIREBASE_SERVICE_ACCOUNT_KEY: Failed to parse JSON');
            }
        }
        this.vertex = new VertexAI({
            project: CONFIG.GCLOUD_PROJECT,
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

    async createCache(content: string, ttlSeconds?: number): Promise<string> {
        try {
            this.logger.info('Creating Context Cache', { ttlSeconds });

            const ttl = ttlSeconds ? `${ttlSeconds}s` : '3600s';
            // Auto-generate a display name since interface doesn't strictly require one
            const displayName = `cache-${Date.now()}`;

            const cache = await this.cacheManager.create({
                model: CONFIG.AI_MODELS.PRIMARY,
                displayName,
                contents: [{ role: 'user', parts: [{ text: content }] }],
                ttl, // Confirmed: 'ttl' is the correct property, takes a duration string
            });

            if (!cache.name) throw new AppError(ErrorCode.INTERNAL_SERVER_ERROR, 'Cache created but name is missing');

            this.logger.info('Context Cache Created Successfully', { cacheName: cache.name });
            return cache.name;
        } catch (error) {
            this.logger.error('Failed to create Context Cache', error);
            throw error;
        }
    }

    async getCache(cacheName: string): Promise<unknown> {
        try {
            this.logger.info('Getting Context Cache', { cacheName });
            const cache = await this.cacheManager.get(cacheName);
            return cache;
        } catch (error) {
            this.logger.error('Failed to get Context Cache', error, { cacheName });
            throw error;
        }
    }

    async updateCache(cacheName: string, ttlSeconds: number): Promise<void> {
        try {
            this.logger.info('Updating Context Cache TTL', { cacheName, ttlSeconds });

            // update() expects (cachedContent, updateMask)
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
            // Ensure we return an array
            // The SDK logic might return a wrapper object
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
}
