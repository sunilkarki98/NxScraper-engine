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

        // Startup Reaper (Principal Audit Fix)
        // Ensure no zombie processes from previous crashes exist (Worker only)
        /*
        if (process.env.SERVICE_TYPE === 'worker') {
            this.killOrphans().catch(err => logger.error({ err }, 'Failed to run startup reaper'));
        }
        */
    }

    /**
     * Kill orphaned browser processes
     * Uses pkill to ensure a clean slate
     */
    private async killOrphans(): Promise<void> {
        const { exec } = await import('child_process');
        const util = await import('util');
        const execAsync = util.promisify(exec);

        logger.info('💀 Reaper: Checking for zombie browser processes...');
        try {
            // Kill chromium, chrome, and playwright instances
            // || true ensures we don't throw if no processes found
            await execAsync('pkill -f "chromium|chrome|playwright" || true');
            logger.info('💀 Reaper: Cleaned up potential zombie processes');
        } catch (error) {
            // Ignore error if it's just "no process found" (handled by || true usually, but just in case)
            logger.debug('Reaper: No zombies found or kill not permitted');
        }
    }

    /**
     * Acquire a browser page for scraping
     */
    private pendingRequests: Array<{
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
        timeout: NodeJS.Timeout;
        options: any; // Store options to retry
    }> = [];

    /**
     * Acquire a browser page for scraping
     * NOW QUEUED: If pool is full, waits for a slot.
     */
    async acquirePage(options: BrowserLaunchOptions & { engine?: 'puppeteer' | 'playwright', timeout?: number } = {}): Promise<{ browser: unknown; page: unknown; instanceId: string }> {
        const engine = options.engine || this.options.defaultEngine!;
        const adapter = this.adapters.get(engine);
        const acquireTimeout = options.timeout || 30000; // Time to wait for a SLOT, not scrape timeout

        if (!adapter) {
            throw new Error(`Browser adapter '${engine}' not found`);
        }

        // 1. Check Capacity BEFORE finding instance
        const currentTotalPages = this.browsers.reduce((sum, b) => sum + b.pageCount, 0);
        const maxCapacity = (this.options.maxBrowsers || 5) * (this.options.maxPagesPerBrowser || 5);

        // If we are FULL, queue the request
        if (currentTotalPages >= maxCapacity) {
            logger.warn({ currentTotalPages, maxCapacity }, '🔒 Browser pool full, queuing request...');

            return new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    // Remove from queue if timed out
                    const idx = this.pendingRequests.findIndex(r => r.timeout === timeoutId);
                    if (idx !== -1) {
                        this.pendingRequests.splice(idx, 1);
                        logger.error('❌ Browser acquisition timed out while queued');
                        reject(new Error(`Browser acquisition timed out after ${acquireTimeout}ms`));
                    }
                }, acquireTimeout);

                this.pendingRequests.push({
                    resolve: (val) => { clearTimeout(timeoutId); resolve(val); },
                    reject: (err) => { clearTimeout(timeoutId); reject(err); },
                    timeout: timeoutId,
                    options // Save options for retry
                });
            });
        }

        // 2. Proceed with acquisition (guaranteed slot available or creating new one)
        // ... (reuse existing or launch new logic) ...

        let instance = this.getAvailableInstance(engine);

        // 3. Create a new browser if needed and allowed
        if (!instance && this.browsers.length < (this.options.maxBrowsers || 5)) {
            instance = await this.launchBrowser(engine, adapter, options);
        }

        // 4. If we still don't have an instance but we are NOT at max pages globally,
        // it means we have browsers but they are all full individually? 
        // Logic check: (total < maxCapacity). So there MUST be room somewhere or room to create.
        // Wait, "getAvailableInstance" checks per-browser limit.
        if (!instance) {
            // This theoretically shouldn't happen if total < maxCapacity AND logic is sound,
            // UNLESS all current browsers are full but we haven't reached maxBrowsers limit yet?
            // Handled by step 3.
            // What if maxBrowsers reached, but total pages < maxCapacity (some browsers have few pages)?
            // We should find that existing browser.
            instance = this.browsers.find(b => b.engine === engine && b.pageCount < (this.options.maxPagesPerBrowser || 5));

            if (!instance) {
                // Should be impossible if capacity check passed, unless race condition (handled by node single thread)
                // Or mismatch in engine types.
                throw new Error('Unexpected pool state: Capacity available but no instance found.');
            }
        }

        try {
            const page = await adapter.newPage(instance.browser, options);
            instance.pageCount++;
            instance.totalPagesCreated = (instance.totalPagesCreated || 0) + 1;
            instance.lastUsedAt = Date.now();

            logger.info(`📄 Page acquired from ${instance.id} (${instance.pageCount} active)`)

                ;

            return {
                browser: instance.browser,
                page,
                instanceId: instance.id
            };
        } catch (error) {
            // CRITICAL: Log page creation failures
            logger.error({
                error,
                instanceId: instance.id,
                engine: instance.engine,
                pageCount: instance.pageCount,
                errorMessage: error instanceof Error ? error.message : String(error)
            }, '❌ Failed to create page on browser instance');

            // Circuit Breaker logic...
            if (this.browsers.includes(instance)) {
                logger.warn(`♻️ Recycling potentially corrupted browser: ${instance.id}`);
                await this.closeBrowser(instance.id);
                // Recursive retry (will re-queue if full, or succeed)
                return this.acquirePage(options);
            }
            throw error;
        }
    }

    private getAvailableInstance(engine: string): IBrowserInstance | undefined {
        const now = Date.now();
        const maxPages = this.options.maxPagesPerBrowser || 20;

        return this.browsers.find(b =>
            b.engine === engine &&
            b.pageCount < maxPages &&
            (now - b.createdAt) < this.MAX_BROWSER_AGE &&
            (b.totalPagesCreated || 0) < this.MAX_BROWSER_PAGES_TOTAL
        );
    }

    /**
     * Helper to launch a new browser instance
     */
    private async launchBrowser(engine: string, adapter: IBrowserAdapter, options: BrowserLaunchOptions): Promise<IBrowserInstance> {
        // ... (existing implementation) ...
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
     * Release a browser page back to the pool AND TRIGGER QUEUE
     */
    async releasePage(instanceId: string, page: unknown): Promise<void> {
        try {
            const instance = this.browsers.find(b => b.id === instanceId);

            if (!instance) {
                logger.warn({ instanceId }, 'Browser instance not found in pool when releasing page');
                return;
            }

            const adapter = this.adapters.get(instance.engine);
            if (!adapter) return;

            try {
                await adapter.closePage(page);
                instance.pageCount = Math.max(0, instance.pageCount - 1);
                instance.lastUsedAt = Date.now();
                logger.info(`📄 Page released from ${instanceId} (${instance.pageCount} active)`);

                // CHECK QUEUE: If we have pending requests, process ONE
                if (this.pendingRequests.length > 0) {
                    const nextRequest = this.pendingRequests.shift();
                    if (nextRequest) {
                        logger.info('🔓 Slot freed, processing queued request...');
                        // Recursive retry using saved options
                        this.acquirePage(nextRequest.options)
                            .then(nextRequest.resolve)
                            .catch(nextRequest.reject);
                    }
                }

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

/**
 * Factory function to create BrowserPool instance
 */
export function createBrowserPool(config?: { maxBrowsers?: number }): BrowserPool {
    const pool = new BrowserPool();
    if (config?.maxBrowsers) {
        (pool as any).maxBrowsers = config.maxBrowsers;
    }
    return pool;
}

/**
 * @deprecated Use createBrowserPool() or inject via DI container
 */
export const browserPool = createBrowserPool();
