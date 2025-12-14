import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRedisClient, cleanRedis } from '../utils/helpers';

describe('Redis Integration', () => {
    beforeEach(async () => {
        await cleanRedis();
    });

    it('should connect to real Redis', async () => {
        const redis = await getRedisClient();

        // Test basic operations
        await redis.set('test:key', 'test-value');
        const value = await redis.get('test:key');

        expect(value).toBe('test-value');
    });

    it('should handle complex data structures', async () => {
        const redis = await getRedisClient();

        const data = {
            id: '123',
            name: 'Test User',
            tags: ['test', 'integration'],
        };

        // Store JSON
        await redis.set('test:user:123', JSON.stringify(data));

        // Retrieve and parse
        const stored = await redis.get('test:user:123');
        const parsed = JSON.parse(stored!);

        expect(parsed).toEqual(data);
    });

    it('should handle TTL and expiration', async () => {
        const redis = await getRedisClient();

        // Set with 2 second TTL
        await redis.set('test:expiring', 'value', 'EX', 2);

        // Should exist immediately
        let value = await redis.get('test:expiring');
        expect(value).toBe('value');

        // Wait 3 seconds
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Should be gone
        value = await redis.get('test:expiring');
        expect(value).toBeNull();
    }, 5000);

    it('should handle lists', async () => {
        const redis = await getRedisClient();

        await redis.rpush('test:queue', 'job1', 'job2', 'job3');

        const length = await redis.llen('test:queue');
        expect(length).toBe(3);

        const first = await redis.lpop('test:queue');
        expect(first).toBe('job1');
    });

    afterEach(async () => {
        await cleanRedis();
    });
});
