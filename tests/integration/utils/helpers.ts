import { getTestRedis, getTestBrowser } from '../setup';
import type { Browser, Page } from 'playwright';
import type Redis from 'ioredis';

/**
 * Get a fresh Redis client for tests
 */
export async function getRedisClient(): Promise<Redis> {
    const redis = getTestRedis();
    if (!redis) {
        throw new Error('Redis not available. Is it running?');
    }
    return redis;
}

/**
 * Get a fresh browser page for tests
 */
export async function getBrowserPage(): Promise<Page> {
    const browser = getTestBrowser();
    if (!browser) {
        throw new Error('Browser not available');
    }
    return await browser.newPage();
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 100
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Clean Redis test data
 */
export async function cleanRedis(): Promise<void> {
    const redis = await getRedisClient();
    await redis.flushdb();
}

/**
 * Create a test API key in Redis
 */
export async function createTestAPIKey(
    keyId: string = 'test-key-123',
    tier: 'free' | 'pro' = 'free'
): Promise<string> {
    const redis = await getRedisClient();

    const keyData = {
        id: keyId,
        key: `sk_test_${keyId}`,
        name: 'Test Key',
        tier,
        isActive: true,
        rateLimit: {
            maxRequests: tier === 'free' ? 100 : 1000,
            windowSeconds: 3600,
        },
        createdAt: Date.now(),
    };

    await redis.set(`api-key:${keyData.key}`, JSON.stringify(keyData));

    return keyData.key;
}

/**
 * Make HTTP request to API
 */
export async function apiRequest(
    path: string,
    options: {
        method?: string;
        body?: any;
        apiKey?: string;
    } = {}
): Promise<Response> {
    const baseUrl = process.env.API_URL || 'http://localhost:3000';
    const url = `${baseUrl}${path}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (options.apiKey) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
    }

    return fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
}
