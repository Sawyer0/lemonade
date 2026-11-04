import { IRateLimiter, IRateLimitResult } from '@lemonade/core';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { injectable } from 'inversify';
import { CONFIG } from '../config';

@injectable()
export class UpstashRateLimiter implements IRateLimiter {
    private freeLimiter: Ratelimit | null = null;
    private proLimiter: Ratelimit | null = null;

    constructor() {
        if (CONFIG.UPSTASH.REDIS_REST_URL && CONFIG.UPSTASH.REDIS_REST_TOKEN) {
            const redis = new Redis({
                url: CONFIG.UPSTASH.REDIS_REST_URL,
                token: CONFIG.UPSTASH.REDIS_REST_TOKEN,
            });

            // Free Tier: 10 requests per minute
            this.freeLimiter = new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(10, '1 m'),
                analytics: true,
                prefix: 'ratelimit:free',
            });

            // Pro Tier: 100 requests per minute
            this.proLimiter = new Ratelimit({
                redis,
                limiter: Ratelimit.slidingWindow(100, '1 m'),
                analytics: true,
                prefix: 'ratelimit:pro',
            });
        }
    }

    async limit(identifier: string, tier: 'free' | 'pro'): Promise<IRateLimitResult> {
        const limiter = tier === 'pro' ? this.proLimiter : this.freeLimiter;

        if (!limiter) {
            // Fallback if Upstash is not configured
            return {
                success: true,
                limit: 0,
                remaining: 0,
                reset: 0,
            };
        }

        const result = await limiter.limit(identifier);

        return {
            success: result.success,
            limit: result.limit,
            remaining: result.remaining,
            reset: result.reset,
        };
    }
}
