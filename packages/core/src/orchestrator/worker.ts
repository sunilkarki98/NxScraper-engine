import { Worker as BullWorker, Job } from 'bullmq';
import { Worker as ThreadWorker } from 'worker_threads';
import { pluginManager } from '../plugins/plugin-manager.js';
import { ScrapeOptions, ScrapeResult, logger, env, container, Tokens, IScraper } from '@nx-scraper/shared';
import { Router } from '../router/router.js';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { getMetrics, initMetrics } from '../observability/metrics.js';

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
    private httpServer?: http.Server;

    constructor(config: { enableHttpServer?: boolean } = {}) {
        // Initialize metrics
        initMetrics();

        // Start System Monitor (Phase 10)
        import('@nx-scraper/shared').then(({ systemMonitor }) => {
            if (systemMonitor) systemMonitor.start();
        });

        // Start request routing/metrics server if enabled
        if (config.enableHttpServer !== false) {
            this.startMetricsServer();
        }

        const connectionUrl = new URL(env.DRAGONFLY_URL);

        this.worker = new BullWorker('scrape-queue', this.processJob.bind(this), {
            connection: {
                host: connectionUrl.hostname,
                port: parseInt(connectionUrl.port || '6379')
            },
            concurrency: env.WORKER_CONCURRENCY,
            lockDuration: 90000, // 90s max per job (prevents infinite hangs)
            lockRenewTime: 30000, // Renew lock every 30s for long jobs
            maxStalledCount: 2 // Retry stalled jobs max 2 times
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
     * Start lightweight HTTP server for metrics/health
     */
    private startMetricsServer() {
        const PORT = env.API_PORT || 3000;

        this.httpServer = http.createServer(async (req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'healthy', worker: true }));
                return;
            }

            if (req.url === '/metrics') {
                try {
                    const metrics = await getMetrics();
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(metrics);
                } catch (error) {
                    res.writeHead(500);
                    res.end('Error generating metrics');
                }
                return;
            }

            res.writeHead(404);
            res.end();
        });

        this.httpServer.listen(PORT, () => {
            logger.info(`📊 Worker Metrics Server listening on port ${PORT}`);
        });
    }

    /**
     * Process a single scraping job
     */
    private async processJob(job: Job<ScrapeOptions>): Promise<ScrapeResult> {
        const startTime = Date.now();
        logger.info(`Processing job ${job.id} for URL: ${job.data.url}`);

        let scraper: IScraper | undefined;

        try {
            let analysis;
            // No cast needed anymore
            const scraperType = job.data.scraperType;

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

            // [Phase 8] Circuit Breaker Check
            const domain = new URL(job.data.url).hostname;
            const circuitBreaker = container.resolve(Tokens.CircuitBreakerService);

            if (await circuitBreaker.isOpen(domain)) {
                throw new Error(`Circuit Breaker OPEN for ${domain}. Request blocked.`);
            }

            // Get metadata for the scraper to pass to the worker
            const metadata = pluginManager.getMetadata(scraper.name);
            if (!metadata) {
                throw new Error(`Metadata not found for scraper: ${scraper.name}`);
            }

            // 3. Execute scraping in a separate thread
            logger.info({
                jobId: job.id,
                scraper: scraper.name,
                url: job.data.url
            }, '⚙️  Spawning worker thread for scraper');

            const result = await this.runInWorkerThread(metadata, job.data);

            logger.info({ jobId: job.id, success: result.success }, '✅ Worker thread completed');

            result.metadata.executionTimeMs = Date.now() - startTime;
            result.metadata.engine = scraper.name;

            // [Phase 8] Record Circuit Status
            if (result.success) {
                await circuitBreaker.recordSuccess(domain);
            } else {
                await circuitBreaker.recordFailure(domain);
            }

            // Phase 9: Record Stats for Learning Router
            try {
                const stats = container.resolve(Tokens.RouterStats);
                // Fire and forget - don't await to avoid latency
                stats.recordResult(domain, scraper.name, result.success).catch((err: any) => {
                    logger.warn({ err }, 'Failed to record router stats');
                });
            } catch (e) { /* Ignore stats errors */ }

            return result;
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));

            // CRITICAL: Log full error details for debugging
            logger.error({
                jobId: job.id,
                url: job.data.url,
                scraperType: job.data.scraperType,
                error: err.message,
                stack: err.stack,
                scraper: scraper?.name || 'unknown'
            }, '❌ JOB FAILED - See error details above');

            // Phase 9: Record Failure Stats
            if (scraper) {
                try {
                    const domain = new URL(job.data.url).hostname;
                    const stats = container.resolve(Tokens.RouterStats);
                    stats.recordResult(domain, scraper.name, false).catch(() => { });

                    // [Phase 8] Record Circuit Failure
                    const circuitBreaker = container.resolve(Tokens.CircuitBreakerService);
                    await circuitBreaker.recordFailure(domain);
                } catch (e) { /* Ignore */ }
            }

            return {
                success: false,
                error: err.message || 'Unknown error',
                metadata: {
                    url: job.data.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime,
                    errorStack: err.stack, // CRITICAL: Include stack trace
                    errorName: err.name,
                    failurePoint: scraper ? 'scraper-execution' : 'scraper-selection'
                }
            };
        }
    }

    /**
     * Run the scraper in a separate Worker Thread
     * This prevents blocking the main event loop and isolates crashes
     */
    private runInWorkerThread(metadata: { packagePath: string; className: string }, options: ScrapeOptions): Promise<ScrapeResult> {
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
        if (this.httpServer) {
            this.httpServer.close();
        }
        await this.worker.close();
        logger.info('Worker shut down');
    }
}
