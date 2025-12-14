import { browserPool } from '../browser/pool.js';
import { rateLimiter } from './rate-limiter.js';
import logger from '../utils/logger.js';

export interface BatchRequest {
    url: string;
    options?: any;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
}

export interface BatchConfig {
    maxBatchSize: number;
    maxWaitMs: number;
    respectRateLimit: boolean;
}

export class RequestBatcher {
    private batches: Map<string, BatchRequest[]> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private config: BatchConfig;

    constructor(config: Partial<BatchConfig> = {}) {
        this.config = {
            maxBatchSize: config.maxBatchSize || 10,
            maxWaitMs: config.maxWaitMs || 2000,
            respectRateLimit: config.respectRateLimit !== false
        };
    }

    /**
     * Add request to batch
     */
    async add<T>(url: string, options?: any): Promise<T> {
        const domain = new URL(url).hostname;

        return new Promise((resolve, reject) => {
            const request: BatchRequest = { url, options, resolve, reject };

            // Get or create batch for domain
            if (!this.batches.has(domain)) {
                this.batches.set(domain, []);
            }

            const batch = this.batches.get(domain)!;
            batch.push(request);

            logger.debug(`Request added to batch for ${domain} (${batch.length}/${this.config.maxBatchSize})`);

            // Process immediately if batch is full
            if (batch.length >= this.config.maxBatchSize) {
                this.processBatch(domain);
            } else {
                // Set timer if not already set
                if (!this.timers.has(domain)) {
                    const timer = setTimeout(() => {
                        this.processBatch(domain);
                    }, this.config.maxWaitMs);
                    this.timers.set(domain, timer);
                }
            }
        });
    }

    /**
     * Process batch for domain
     */
    private async processBatch(domain: string): Promise<void> {
        // Clear timer
        const timer = this.timers.get(domain);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(domain);
        }

        // Get batch
        const batch = this.batches.get(domain);
        if (!batch || batch.length === 0) {
            return;
        }

        // Remove from pending batches
        this.batches.delete(domain);

        logger.info(`Processing batch for ${domain} with ${batch.length} requests`);

        // Check rate limit if enabled
        if (this.config.respectRateLimit) {
            const canProceed = await rateLimiter.waitForSlot(domain, 5000);
            if (!canProceed) {
                // Rate limit exceeded, reject all requests in batch
                const error = new Error(`Rate limit exceeded for ${domain}`);
                batch.forEach(req => req.reject(error));
                return;
            }
        }

        // Acquire a single browser page for the whole batch
        let page: any;
        let instanceId: string | undefined;

        try {
            const result = await browserPool.acquirePage({
                engine: 'playwright',
                evasion: { fingerprint: true }
            });
            page = result.page;
            instanceId = result.instanceId;

            // Process each request in the batch sequentially (same page, same domain)
            for (const request of batch) {
                try {
                    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                    // Extract content (customize based on your needs)
                    const content = await page.content();
                    const title = await page.title();

                    request.resolve({
                        success: true,
                        url: request.url,
                        title,
                        content,
                        timestamp: Date.now()
                    });

                    logger.debug(`Batch request completed: ${request.url}`);
                } catch (error: any) {
                    logger.error(error, `Batch request failed: ${request.url}`);
                    request.reject(error);
                }
            }
        } catch (error: any) {
            logger.error(error, `Failed to process batch for ${domain}:`);
            // Reject all requests in batch
            batch.forEach(req => req.reject(error));
        } finally {
            // Release page
            if (page && instanceId) {
                await browserPool.releasePage(instanceId, page);
            }
        }
    }

    /**
     * Get batch statistics
     */
    getStats() {
        const domains = Array.from(this.batches.keys());
        return {
            activeBatches: this.batches.size,
            domains,
            pending: domains.map(d => ({
                domain: d,
                count: this.batches.get(d)?.length || 0
            }))
        };
    }

    /**
     * Flush all pending batches
     */
    async flushAll(): Promise<void> {
        const domains = Array.from(this.batches.keys());
        logger.info(`Flushing ${domains.length} pending batches`);

        for (const domain of domains) {
            await this.processBatch(domain);
        }
    }
}

export const requestBatcher = new RequestBatcher();
