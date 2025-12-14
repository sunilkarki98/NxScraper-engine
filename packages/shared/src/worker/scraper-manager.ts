import { Worker } from 'worker_threads';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ScrapeOptions, ScrapeResult } from '../types/scraper.interface.js';
import logger from '../utils/logger.js';
import { rateLimiter } from '../services/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ScraperManager {
    private workerPath: string | null = null;

    initialize(config: { workerPath: string }) {
        this.workerPath = config.workerPath;
    }

    private getWorkerPath(): string {
        if (!this.workerPath) {
            throw new Error('ScraperManager not initialized. Call initialize({ workerPath }) first.');
        }
        return this.workerPath;
    }



    /**
     * Run a scraper in a worker thread
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

        const workerPath = this.getWorkerPath();
        const isTsNode = workerPath.endsWith('.ts');

        return new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: {},
                execArgv: isTsNode ? ['-r', 'ts-node/register'] : undefined
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error(`Scraper worker timed out after ${options.timeout || 30000}ms`));
            }, options.timeout || 30000);

            worker.on('message', (message: { success: boolean; result?: ScrapeResult; error?: string }) => {
                clearTimeout(timeout);
                if (message.success && message.result) {
                    resolve(message.result);
                } else {
                    reject(new Error(message.error || 'Unknown worker error'));
                }
                worker.terminate().catch(() => { }); // Kill worker after job
            });

            worker.on('error', (error) => {
                clearTimeout(timeout);
                logger.error({ error, workerPath: this.workerPath }, 'Worker thread error');
                reject(error);
                worker.terminate().catch(err => logger.error({ err }, 'Failed to terminate worker on error'));
            });

            worker.on('exit', (code) => {
                clearTimeout(timeout);
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });

            // Send job to worker
            worker.postMessage({ scraper: scraperName, options });
        });
    }
}

export const scraperManager = new ScraperManager();
