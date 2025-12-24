export interface IRateLimitResult {
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
}

export interface IRateLimiter {
    /**
     * @param identifier - Unique ID to rate limit (user ID or IP)
     * @param tier - User tier ('free' or 'pro')
     */
    limit(identifier: string, tier: 'free' | 'pro'): Promise<IRateLimitResult>;
}
