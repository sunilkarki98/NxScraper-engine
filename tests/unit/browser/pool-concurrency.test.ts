import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserPool } from '../../../packages/shared/src/browser/pool';

// Mock everything external
vi.mock('../../../packages/shared/src/utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock Adapters properly
// We need to bypass the actual recursive requires in pool.ts which might be hard.
// Instead we'll subclass BrowserPool to inject mock adapters if possible, or just mock the adapter module paths?
// pool.ts imports adapters explicitly.

vi.mock('../../../packages/shared/src/browser/adapters/puppeteer-adapter', () => ({
    PuppeteerAdapter: class {
        launch = vi.fn().mockResolvedValue({ close: vi.fn(), on: vi.fn() });
        newPage = vi.fn().mockResolvedValue({ close: vi.fn() });
        closePage = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
    }
}));

vi.mock('../../../packages/shared/src/browser/adapters/playwright-adapter', () => ({
    PlaywrightAdapter: class {
        launch = vi.fn().mockResolvedValue({ close: vi.fn(), on: vi.fn() });
        newPage = vi.fn().mockResolvedValue({ close: vi.fn() });
        closePage = vi.fn().mockResolvedValue(undefined);
        close = vi.fn().mockResolvedValue(undefined);
    }
}));


describe('BrowserPool Concurrency', () => {
    let pool: BrowserPool;

    beforeEach(() => {
        // Create pool with VERY SMALL capacity for testing
        // Max 1 browser, max 2 pages = 2 total concurrent slots
        pool = new BrowserPool({
            maxBrowsers: 1,
            maxPagesPerBrowser: 2,
            browserIdleTimeout: 1000
        });

        // Disable startup reaper to avoid process exec calls
        (pool as any).killOrphans = vi.fn().mockResolvedValue(undefined);
    });

    afterEach(async () => {
        await pool.shutdown();
        vi.clearAllMocks();
    });

    it('should queue requests when at capacity', async () => {
        // 1. Fill the pool
        const page1 = await pool.acquirePage();
        const page2 = await pool.acquirePage();

        expect(page1).toBeDefined();
        expect(page2).toBeDefined();

        // 2. Request a 3rd page - Should pending
        let slot3Received = false;
        const page3Promise = pool.acquirePage({ timeout: 5000 }); // Fast timeout

        page3Promise.then(() => { slot3Received = true; });

        // Wait a bit to ensure it didn't resolve immediately
        await new Promise(r => setTimeout(r, 100));
        expect(slot3Received).toBe(false); // Should be stuck in queue

        // 3. Release a page to free slot
        await pool.releasePage(page1.instanceId, page1.page);

        // 4. Verify 3rd page gets acquired
        const page3 = await page3Promise;
        expect(page3).toBeDefined();
        expect(slot3Received).toBe(true);
    });

    it('should timeout if slot never frees up', async () => {
        // Fill pool
        await pool.acquirePage();
        await pool.acquirePage();

        // Request 3rd with 200ms timeout
        await expect(pool.acquirePage({ timeout: 200 }))
            .rejects.toThrow('Browser acquisition timed out');
    });
});
