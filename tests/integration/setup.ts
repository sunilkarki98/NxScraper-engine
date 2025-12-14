/**
 * Integration test setup
 * Sets up and tears down real services
 */

import { beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { chromium, Browser } from 'playwright';

// Global test state
let redis: Redis | null = null;
let browser: Browser | null = null;

/**
 * Setup before all integration tests
 */
beforeAll(async () => {
    console.log('🔧 Setting up integration test environment...');

    // Connect to test Redis
    redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_TEST_DB || '15'), // Use DB 15 for tests
        lazyConnect: true,
    });

    try {
        await redis.connect();
        await redis.flushdb(); // Clear test database
        console.log('✅ Redis connected');
    } catch (error) {
        console.warn('⚠️  Redis not available, some tests may fail');
    }

    // Launch headless browser
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        console.log('✅ Browser launched');
    } catch (error) {
        console.warn('⚠️  Browser not available, some tests may fail');
    }

    console.log('✅ Integration test environment ready!\n');
}, 30000);

/**
 * Cleanup after all integration tests
 */
afterAll(async () => {
    console.log('\n🧹 Cleaning up integration test environment...');

    // Close Redis
    if (redis) {
        await redis.flushdb(); // Clean up test data
        await redis.quit();
        console.log('✅ Redis closed');
    }

    // Close browser
    if (browser) {
        await browser.close();
        console.log('✅ Browser closed');
    }

    console.log('✅ Cleanup complete!');
}, 30000);

// Export for use in tests
export const getTestRedis = () => redis;
export const getTestBrowser = () => browser;
