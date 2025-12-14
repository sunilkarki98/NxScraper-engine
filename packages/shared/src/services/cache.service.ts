import logger from '../utils/logger.js';
import { dragonfly } from '../database/dragonfly-client.js';

export class CacheService {
    private defaultTTL: number;
    private readonly prefix = 'service:cache:';

    constructor(maxSize: number = 1000, defaultTTL: number = 3600000) {
        this.defaultTTL = Math.floor(defaultTTL / 1000); // Convert ms to seconds for Redis
        logger.info(`📦 CacheService initialized (Distributed Backend, default TTL: ${this.defaultTTL}s)`);
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const client = await dragonfly.getClient();
            const data = await client.get(this.prefix + key);

            if (!data) {
                return null;
            }

            logger.debug(`Cache HIT: ${key}`);
            return JSON.parse(data) as T;
        } catch (error) {
            logger.warn({ error, key }, 'CacheService get failed');
            return null;
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const client = await dragonfly.getClient();
            const data = JSON.stringify(value);
            // Convert ms to seconds if ttl provided, else use default
            const finalTTL = ttl ? Math.floor(ttl / 1000) : this.defaultTTL;

            await client.setex(this.prefix + key, finalTTL, data);
            logger.debug(`Cache SET: ${key} (TTL: ${finalTTL}s)`);
        } catch (error) {
            logger.warn({ error, key }, 'CacheService set failed');
        }
    }

    async delete(key: string): Promise<void> {
        try {
            const client = await dragonfly.getClient();
            await client.del(this.prefix + key);
        } catch (error) {
            logger.warn({ error, key }, 'CacheService delete failed');
        }
    }

    async clear(): Promise<void> {
        try {
            const client = await dragonfly.getClient();
            let cursor = '0';
            let totalDeleted = 0;
            const BATCH_SIZE = 100;

            do {
                const [nextCursor, keys] = await client.scan(
                    cursor,
                    'MATCH', this.prefix + '*',
                    'COUNT', BATCH_SIZE
                );

                if (keys.length > 0) {
                    await client.del(...keys);
                    totalDeleted += keys.length;
                }

                cursor = nextCursor;
            } while (cursor !== '0');

            logger.info({ count: totalDeleted }, 'CacheService cleared');
        } catch (error) {
            logger.warn({ error }, 'CacheService clear failed');
        }
    }

    // No-op for distributed cache as Redis handles cleanup
    private cleanup(): void { }

    async getStats() {
        try {
            const client = await dragonfly.getClient();
            const info = await client.info('memory');
            const usedMemory = info.match(/used_memory_human:(\w+)/)?.[1] || 'unknown';

            // Estimate keys count just for this prefix is expensive (requires scan)
            // So we return global stats or simplified view
            return {
                backend: 'dragonfly',
                status: 'connected',
                usedMemory
            };
        } catch (error) {
            return { backend: 'dragonfly', status: 'error' };
        }
    }
}

// Singleton instance
export const cacheService = new CacheService();
