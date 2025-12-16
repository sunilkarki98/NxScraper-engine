import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { rateLimiter } from '@nx-scraper/shared';
import { Piscina } from 'piscina';
import { env } from '@nx-scraper/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ScraperManager {
    private workerPath: string | null = null;
    private pool: Piscina | null = null;

    initialize(config: { workerPath: string }) {
        this.workerPath = config.workerPath;
        const isTsNode = this.workerPath.endsWith('.ts');

        logger.info(`🏊 ScraperManager: Initializing Piscina pool (Worker Path: ${this.workerPath})`);

        this.pool = new Piscina({
            filename: this.workerPath,
            maxThreads: env.MAX_WORKER_THREADS,
            minThreads: 1, // Keep at least one warm worker
            idleTimeout: 30000, // 30s idle before scaling down
            // Important for ts-node support in dev
            execArgv: isTsNode ? ['-r', 'ts-node/register'] : undefined,
            workerData: {
                // Pass any static environment/config here if needed
            }
        });

        this.pool.on('error', (error) => {
            logger.error({ error }, 'Piscina pool error');
        });
    }

    private getPool(): Piscina {
        if (!this.pool) {
            throw new Error('ScraperManager not initialized. Call initialize({ workerPath }) first.');
        }
        return this.pool;
    }

    /**
     * Run a scraper in a worker thread via pool
     */
    async runScraper(scraperName: string, options: ScrapeOptions): Promise<ScrapeResult> {
        // Enforce Global Rate Limit
        if (options.url) {
            try {
                const domain = new URL(options.url).hostname;
                logger.debug({ domain }, '⏳ Checking rate limit...');
                const allowed = await rateLimiter.waitForSlot(domain);
                if (!allowed) {
                    throw new Error(`Rate limit exceeded for ${domain} - request rejected`);
                }
            } catch (error) {
                logger.warn({ error, url: options.url }, 'Rate limit check failed (or invalid URL), proceeding cautiously');
            }
        }

        const pool = this.getPool();
        const timeoutMs = options.timeout || 30000;
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

        try {
            logger.debug({ scraper: scraperName, url: options.url }, 'Submitting job to worker pool');

            const result = await pool.run(
                {
                    packagePath: scraperName,
                    className: scraperName,
                    options
                },
                {
                    signal: abortController.signal
                }
            );

            clearTimeout(timeoutId);
            return result as ScrapeResult;

        } catch (error: unknown) {
            clearTimeout(timeoutId);

            const errorMessage = error instanceof Error ? error.message : String(error);

            if (abortController.signal.aborted) {
                logger.error({ scraper: scraperName, timeoutMs }, 'Worker execution timed out');
                throw new Error(`Scraper timed out after ${timeoutMs}ms`);
            }

            logger.error({ error, scraper: scraperName }, 'Worker pool execution failed');
            throw error;
        }


    }
}

export const scraperManager = new ScraperManager();
