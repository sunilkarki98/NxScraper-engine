import { IBrowserAdapter, IBrowserInstance, BrowserLaunchOptions, BrowserPoolOptions } from '../types/browser.interface.js';
import { PuppeteerAdapter } from './adapters/puppeteer-adapter.js';
import { PlaywrightAdapter } from './adapters/playwright-adapter.js';
import logger from '../utils/logger.js';
import { fingerprintGenerator } from './fingerprint-generator.js';
import { InternalServerError } from '../types/errors.js';

// ... imports

export class BrowserPool {
    private adapters: Map<string, IBrowserAdapter> = new Map();
    private browsers: IBrowserInstance[] = [];
    private options: BrowserPoolOptions;
    private cleanupInterval?: NodeJS.Timeout;

    // Lifecycle constraints
    private readonly MAX_BROWSER_AGE = 30 * 60 * 1000; // 30 minutes
    private readonly MAX_BROWSER_PAGES_TOTAL = 100; // Recycling threshold

    constructor(options: BrowserPoolOptions = {}) {
        this.options = {
            maxBrowsers: options.maxBrowsers || 5,
            maxPagesPerBrowser: options.maxPagesPerBrowser || 5,
            browserIdleTimeout: options.browserIdleTimeout || 60000, // 1 minute
            defaultEngine: options.defaultEngine || 'playwright'
        };

        // Register adapters
        this.adapters.set('puppeteer', new PuppeteerAdapter());
        this.adapters.set('playwright', new PlaywrightAdapter());

        logger.info(`🌐 BrowserPool initialized with max ${this.options.maxBrowsers} browsers`);

        // Start idle cleanup interval
        this.startIdleCleanup();
    }

    /**
     * Acquire a browser page for scraping
     */
    async acquirePage(options: BrowserLaunchOptions & { engine?: 'puppeteer' | 'playwright' } = {}): Promise<{ browser: unknown; page: unknown; instanceId: string }> {
        const engine = options.engine || this.options.defaultEngine!;
        const adapter = this.adapters.get(engine);

        if (!adapter) {
            throw new Error(`Browser adapter '${engine}' not found`);
        }

        const now = Date.now();

        // 1. Try to reuse an existing browser that is healthy
        let instance = this.browsers.find(b =>
            b.engine === engine &&
            b.pageCount < this.options.maxPagesPerBrowser! &&
            (now - b.createdAt) < this.MAX_BROWSER_AGE &&
            (b.totalPagesCreated || 0) < this.MAX_BROWSER_PAGES_TOTAL
        );

        // 2. If no browser available and we're at capacity, try to make room
        if (!instance && this.browsers.length >= this.options.maxBrowsers!) {
            // Find easiest candidate to recycle (e.g. idle or oldest)
            // For now, adhere to old logic but add logging. Better strategy: wait for slot.
            // But to avoid deadlock without a queue, we reuse the least busy one if strictly needed
            // OR we force one to close if it's idle?

            // Current "simple" strategy: Just pick one.
            logger.warn(`Browser pool at capacity (${this.options.maxBrowsers}). reusing least loaded instance...`);
            instance = this.browsers.reduce((prev, curr) =>
                curr.pageCount < prev.pageCount ? curr : prev
            );
        }

        // 3. Create a new browser if needed
        if (!instance) {
            instance = await this.launchBrowser(engine, adapter, options);
        }

        // 4. Create Page with Circuit Breaker
        try {
            const page = await adapter.newPage(instance.browser, options);
            instance.pageCount++;
            instance.totalPagesCreated = (instance.totalPagesCreated || 0) + 1;
            instance.lastUsedAt = Date.now();

            logger.info(`📄 Page acquired from ${instance.id} (${instance.pageCount} active, ${instance.totalPagesCreated} total)`);

            return {
                browser: instance.browser,
                page,
                instanceId: instance.id
            };
        } catch (error) {
            logger.error({ error, instanceId: instance.id }, 'Failed to create page on browser instance');

            // Circuit Breaker: If creating a page fails, the browser might be zombie.
            // If it was an existing instance, close it and try creating a fresh one.
            if (this.browsers.includes(instance)) {
                logger.warn(`♻️ Recycling potentially corrupted browser: ${instance.id}`);
                await this.closeBrowser(instance.id);

                // Retry once with a fresh browser
                logger.info('Retrying with a fresh browser instance...');
                const newInstance = await this.launchBrowser(engine, adapter, options);
                const page = await adapter.newPage(newInstance.browser, options);

                newInstance.pageCount++;
                newInstance.totalPagesCreated = (newInstance.totalPagesCreated || 0) + 1;
                newInstance.lastUsedAt = Date.now();

                return {
                    browser: newInstance.browser,
                    page,
                    instanceId: newInstance.id
                };
            }
            throw error;
        }
    }

    /**
     * Helper to launch a new browser instance
     */
    private async launchBrowser(engine: string, adapter: IBrowserAdapter, options: BrowserLaunchOptions): Promise<IBrowserInstance> {
        logger.info(`Launching new ${engine} browser...`);

        // Generate Fingerprint
        const fp = fingerprintGenerator.generate();
        const launchOptions = {
            ...options,
            viewport: fp.viewport,
            userAgent: fp.userAgent,
            args: [
                `--user-agent=${fp.userAgent}`,
                `--window-size=${fp.viewport.width},${fp.viewport.height}`
            ]
        };

        const browser = await adapter.launch(launchOptions);
        const instance: IBrowserInstance = {
            id: `${engine}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            engine: engine as 'puppeteer' | 'playwright',
            browser,
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            pageCount: 0,
            totalPagesCreated: 0
        };
        this.browsers.push(instance);

        // Self-healing: Detect crashes/external kills
        (browser as any).on('disconnected', () => {
            logger.warn(`⚠️ Browser ${instance.id} disconnected unexpectedly! Removing from pool.`);
            this.closeBrowser(instance.id).catch(err =>
                logger.error({ err }, `Failed to clean up disconnected browser ${instance.id}`)
            );
        });

        logger.info(`✅ Browser launched: ${instance.id}`);
        return instance;
    }

    /**
     * Release a browser page back to the pool
     */
    async releasePage(instanceId: string, page: unknown): Promise<void> {
        try {
            const instance = this.browsers.find(b => b.id === instanceId);

            if (!instance) {
                logger.warn({ instanceId }, 'Browser instance not found in pool when releasing page');
                // Try to close page anyway if possible? Hard without adapter.
                return;
            }

            const adapter = this.adapters.get(instance.engine);
            if (!adapter) return;

            try {
                await adapter.closePage(page);
                instance.pageCount = Math.max(0, instance.pageCount - 1);
                instance.lastUsedAt = Date.now();
                logger.info(`📄 Page released from ${instanceId} (${instance.pageCount} active)`);
            } catch (error) {
                logger.error({ error, instanceId }, `Failed to close page properly`);
            }
        } catch (error) {
            logger.error({ error }, 'Error releasing page from pool');
            throw new InternalServerError('Failed to release browser page', { error: String(error) });
        }
    }

    /**
     * Close a specific browser instance
     */
    private async closeBrowser(instanceId: string): Promise<void> {
        const index = this.browsers.findIndex(b => b.id === instanceId);
        if (index === -1) return;

        const instance = this.browsers[index];
        // Remove from list immediately to prevent reuse
        this.browsers.splice(index, 1);

        const adapter = this.adapters.get(instance.engine);
        if (adapter) {
            try {
                await adapter.close(instance.browser);
                logger.info(`🔒 Browser closed: ${instanceId}`);
            } catch (error) {
                logger.error({ error }, `Failed to close browser ${instanceId}`);
            }
        }
    }

    /**
     * Start periodic cleanup of idle and aged browsers
     */
    private startIdleCleanup(): void {
        // Clear existing execution if any (though safe due to singleton usually)
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);

        this.cleanupInterval = setInterval(() => {
            const now = Date.now();

            // 1. Identify browsers to recycle
            const browsersToClose = this.browsers.filter(b => {
                // Condition A: Idle for too long
                const isIdle = b.pageCount === 0 && (now - b.lastUsedAt) > this.options.browserIdleTimeout!;

                // Condition B: Exceeded maximum age
                const isOld = (now - b.createdAt) > this.MAX_BROWSER_AGE;

                // Condition C: Exceeded total pages threshold
                const isExhausted = (b.totalPagesCreated || 0) >= this.MAX_BROWSER_PAGES_TOTAL;

                return isIdle || isOld || isExhausted;
            });

            for (const browser of browsersToClose) {
                const reason =
                    (now - browser.createdAt) > this.MAX_BROWSER_AGE ? 'Age limit' :
                        (browser.totalPagesCreated || 0) >= this.MAX_BROWSER_PAGES_TOTAL ? 'Usage limit' : 'Idle timeout';

                logger.info(`♻️ Recycling browser ${browser.id} (${reason})`);
                this.closeBrowser(browser.id);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Shutdown all browsers
     */
    async shutdown(): Promise<void> {
        logger.info(`Shutting down BrowserPool (${this.browsers.length} browsers)...`);

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }

        // Create a copy to iterate because closeBrowser modifies the array
        const browsers = [...this.browsers];
        for (const instance of browsers) {
            await this.closeBrowser(instance.id);
        }

        this.browsers = [];
        logger.info('BrowserPool shut down');
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            totalBrowsers: this.browsers.length,
            activePages: this.browsers.reduce((sum, b) => sum + b.pageCount, 0),
            totalPagesCreated: this.browsers.reduce((sum, b) => sum + (b.totalPagesCreated || 0), 0),
            maxBrowsers: this.options.maxBrowsers,
            browsers: this.browsers.map(b => ({
                id: b.id,
                engine: b.engine,
                pages: b.pageCount,
                totalCreated: b.totalPagesCreated,
                ageSeconds: Math.floor((Date.now() - b.createdAt) / 1000),
                idleSeconds: Math.floor((Date.now() - b.lastUsedAt) / 1000)
            }))
        };
    }
}

// Singleton instance
export const browserPool = new BrowserPool();
