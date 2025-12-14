import { Worker as BullWorker, Job } from 'bullmq';
import { Worker as ThreadWorker } from 'worker_threads';
import { pluginManager } from '../plugins/plugin-manager.js';
import { ScrapeOptions, ScrapeResult, logger, env } from '@nx-scraper/shared';
import { Router } from '../router/router.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve worker path based on environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Job Worker
 * Processes scraping jobs from the queue
 */
export class JobWorker {
    private worker: BullWorker;
    private router = new Router();

    constructor() {
        const connectionUrl = new URL(env.DRAGONFLY_URL);

        this.worker = new BullWorker('scrape-queue', this.processJob.bind(this), {
            connection: {
                host: connectionUrl.hostname,
                port: parseInt(connectionUrl.port || '6379')
            },
            concurrency: env.WORKER_CONCURRENCY
        });

        this.worker.on('completed', (job) => {
            logger.info(`Job ${job.id} completed successfully`);
        });

        this.worker.on('failed', (job, error) => {
            logger.error(error, `Job ${job?.id} failed:`);
        });

        logger.info('🚀 Worker started');
    }

    /**
     * Process a single scraping job
     */
    private async processJob(job: Job<ScrapeOptions>): Promise<ScrapeResult> {
        const startTime = Date.now();
        logger.info(`Processing job ${job.id} for URL: ${job.data.url}`);

        try {
            let scraper;
            let analysis;
            const scraperType = (job.data as any).scraperType;

            if (scraperType) {
                logger.info(`Using requested scraper: ${scraperType}`);
                scraper = pluginManager.getScraperByName(scraperType);
            }

            if (!scraper) {
                // 1. Analyze URL to get recommended engine
                analysis = await this.router.analyze(job.data.url);
                logger.info(`Router analysis: ${analysis.recommendedEngine} (confidence: ${analysis.confidence})`);
                scraper = pluginManager.getScraperByName(analysis.recommendedEngine);
            }

            // 2. Fallback if recommended scraper is not registered
            if (!scraper) {
                const recEngine = analysis?.recommendedEngine || 'unknown';
                logger.warn(`Recommended scraper '${recEngine}' not found. Falling back to auto-discovery.`);
                const bestScraper = await pluginManager.findBestScraper(job.data.url);
                if (bestScraper) {
                    scraper = bestScraper;
                }
            }

            if (!scraper) {
                throw new Error(`No suitable scraper found for ${job.data.url}`);
            }

            // Get metadata for the scraper to pass to the worker
            const metadata = pluginManager.getMetadata(scraper.name);
            if (!metadata) {
                throw new Error(`Metadata not found for scraper: ${scraper.name}`);
            }

            // 3. Execute scraping in a separate thread
            logger.info(`Spawning worker for scraper: ${scraper.name}`);

            const result = await this.runInWorkerThread(metadata, job.data);

            result.metadata.executionTimeMs = Date.now() - startTime;
            result.metadata.engine = scraper.name;

            return result;
        } catch (error: any) {
            logger.error(error, `Job ${job.id} error:`);

            return {
                success: false,
                error: error.message || 'Unknown error',
                metadata: {
                    url: job.data.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime
                }
            };
        }
    }

    /**
     * Run the scraper in a separate Worker Thread
     * This prevents blocking the main event loop and isolates crashes
     */
    private runInWorkerThread(metadata: any, options: ScrapeOptions): Promise<ScrapeResult> {
        return new Promise((resolve, reject) => {
            const isDev = env.NODE_ENV !== 'production';

            // In dev (TS), use .ts extension. In prod (JS), use .js
            const workerFile = isDev ? '../worker/scraper.worker.ts' : '../worker/scraper.worker.js';
            const workerPath = path.resolve(__dirname, workerFile);

            // Use tsx for dev execution of TS worker files
            const workerOptions = isDev ? {
                execArgv: ['--import', 'tsx/esm']
            } : {};

            const thread = new ThreadWorker(workerPath, workerOptions);

            // Send job data to the worker
            thread.postMessage({
                packagePath: metadata.packagePath,
                className: metadata.className,
                options
            });

            thread.on('message', (message) => {
                if (message.success) {
                    resolve(message.result);
                } else {
                    reject(new Error(message.error || 'Worker execution failed'));
                }
                thread.terminate();
            });

            thread.on('error', (error) => {
                reject(error);
                thread.terminate();
            });

            thread.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down worker...');
        await this.worker.close();
        logger.info('Worker shut down');
    }
}
