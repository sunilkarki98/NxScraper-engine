import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';

export interface RateLimitConfig {
    domain: string;
    maxRequests: number;
    windowSeconds: number;
    strategy?: 'sliding' | 'fixed';
}

export class RateLimiter {
    private configs: Map<string, RateLimitConfig> = new Map();
    private defaultConfig: RateLimitConfig = {
        domain: 'default',
        maxRequests: 60,
        windowSeconds: 60,
        strategy: 'sliding'
    };

    /**
     * Configure rate limit for a specific domain
     */
    setLimit(config: RateLimitConfig): void {
        this.configs.set(config.domain, config);
        logger.info(`Rate limit set for ${config.domain}: ${config.maxRequests} req/${config.windowSeconds}s`);
    }

    /**
     * Check if request is allowed (and increment counter)
     */
    async checkLimit(
        domain: string,
        overrideConfig?: { maxRequests?: number; windowSeconds?: number; strategy?: 'sliding' | 'fixed' }
    ): Promise<{ allowed: boolean; remaining: number; resetAt: number; retryAfter?: number }> {
        const baseConfig = this.configs.get(domain) || this.defaultConfig;
        const config = { ...baseConfig, ...overrideConfig }; // Merge provided config with base config
        const client = dragonfly.getClient();

        if (config.strategy === 'sliding') {
            return this.slidingWindowCheck(client, domain, config);
        } else {
            return this.fixedWindowCheck(client, domain, config);
        }
    }

    /**
     * Fixed window rate limiting (simpler, less accurate)
     */
    private async fixedWindowCheck(
        client: any,
        domain: string,
        config: RateLimitConfig
    ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
        const key = `ratelimit:fixed:${domain}`;
        const now = Date.now();
        const windowStart = Math.floor(now / (config.windowSeconds * 1000)) * config.windowSeconds * 1000;
        const resetAt = windowStart + (config.windowSeconds * 1000);

        // Increment counter
        const count = await client.incr(key);

        // Set expiration on first request in window
        if (count === 1) {
            await client.pexpireat(key, resetAt);
        }

        const allowed = count <= config.maxRequests;
        const remaining = Math.max(0, config.maxRequests - count);

        if (!allowed) {
            logger.warn(`Rate limit exceeded for ${domain}: ${count}/${config.maxRequests}`);
        }

        return { allowed, remaining, resetAt };
    }

    /**
     * Sliding window rate limiting (more accurate, prevents burst at window edges)
     */
    private async slidingWindowCheck(
        client: any,
        domain: string,
        config: RateLimitConfig
    ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
        const key = `ratelimit:sliding:${domain}`;
        const now = Date.now();
        const windowStart = now - (config.windowSeconds * 1000);

        // Remove old entries
        await client.zremrangebyscore(key, '-inf', windowStart);

        // Count requests in window
        const count = await client.zcard(key);

        const allowed = count < config.maxRequests;

        if (allowed) {
            // Add current request with timestamp as score
            await client.zadd(key, now, `${now}-${Math.random()}`);
            // Set expiration
            await client.expire(key, config.windowSeconds + 1);
        }

        const remaining = Math.max(0, config.maxRequests - count - (allowed ? 1 : 0));
        const resetAt = now + (config.windowSeconds * 1000);

        if (!allowed) {
            logger.warn(`Rate limit exceeded for ${domain}: ${count}/${config.maxRequests}`);
        }

        return { allowed, remaining, resetAt };
    }

    /**
     * Wait until rate limit allows request
     */
    async waitForSlot(domain: string, maxWaitMs: number = 5000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitMs) {
            const result = await this.checkLimit(domain);

            if (result.allowed) {
                return true;
            }

            // Wait until reset or shorter interval
            const waitMs = Math.min(result.resetAt - Date.now(), 1000);
            if (waitMs > 0) {
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }

        return false;
    }

    /**
     * Get current rate limit status
     */
    async getStatus(domain: string): Promise<{ current: number; limit: number; window: number }> {
        const config = this.configs.get(domain) || this.defaultConfig;
        const client = dragonfly.getClient();
        const key = config.strategy === 'sliding'
            ? `ratelimit:sliding:${domain}`
            : `ratelimit:fixed:${domain}`;

        let current = 0;
        if (config.strategy === 'sliding') {
            const now = Date.now();
            const windowStart = now - (config.windowSeconds * 1000);
            await client.zremrangebyscore(key, '-inf', windowStart);
            current = await client.zcard(key);
        } else {
            current = parseInt(await client.get(key) || '0');
        }

        return {
            current,
            limit: config.maxRequests,
            window: config.windowSeconds
        };
    }

    /**
     * Reset rate limit for domain
     */
    async reset(domain: string): Promise<void> {
        const client = dragonfly.getClient();
        await client.del(`ratelimit:sliding:${domain}`);
        await client.del(`ratelimit:fixed:${domain}`);
        logger.info(`Rate limit reset for ${domain}`);
    }
}

/**
 * Factory function to create RateLimiter instance
 */
export function createRateLimiter(): RateLimiter {
    const limiter = new RateLimiter();
    // Configure common domains with sensible defaults
    limiter.setLimit({ domain: 'google.com', maxRequests: 10, windowSeconds: 60 });
    limiter.setLimit({ domain: 'linkedin.com', maxRequests: 5, windowSeconds: 60 });
    limiter.setLimit({ domain: 'facebook.com', maxRequests: 10, windowSeconds: 60 });
    limiter.setLimit({ domain: 'twitter.com', maxRequests: 15, windowSeconds: 60 });
    return limiter;
}

/**
 * @deprecated Use createRateLimiter() or inject via DI container
 */
export const rateLimiter = createRateLimiter();
