
import { Worker, Job } from 'bullmq';
import { scraperManager } from './scraper-manager.js';
import {
    JobData,
    type ScrapeJobData,
    type JobDataType,
    AIModuleOptions,
    knowledgeBase,
    logger,
    contextStorage,
    env,
    IMetricsRecorder,
    IWebhookDispatcher,
    proxyManager,
    ProxyType,
    QueueManager,
    JobType,
    container,
    Tokens,
    ScrapeOptions,
    ScrapeResult,
    toApplicationError,
    classifyError,
    enhanceErrorContext,
    logClassifiedError,
    extractFromJob,
    ErrorCategory,
    FailurePoint
} from '@nx-scraper/shared';
import {
    startWorkerHealthMonitoring,
    recordJobStart,
    recordJobComplete,
    recordWorkerError,
    recordStalledJob,
    recordFailedJob,
    WORKER_ID
} from '../observability/worker-metrics.js';

export class QueueWorker {
    private workers: Map<string, Worker> = new Map();
    private initialized = false;
    private metricsRecorder?: IMetricsRecorder;
    private webhookDispatcher?: IWebhookDispatcher;

    constructor() {
        // Deferred initialization
    }

    public setMetricsRecorder(recorder: IMetricsRecorder) {
        this.metricsRecorder = recorder;
    }

    public setWebhookDispatcher(dispatcher: IWebhookDispatcher) {
        this.webhookDispatcher = dispatcher;
    }

    private ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;
        this.initializeWorker('scrape-queue', this.processScrapeJob.bind(this));
        this.initializeWorker('ai-queue', this.processAIJob.bind(this));
    }

    private initializeWorker(name: string, processor: (job: Job) => Promise<unknown>) {
        const queueManager = container.resolve(Tokens.QueueManager);
        const connection = queueManager.getConnectionConfig();

        const worker = new Worker(name, processor, {
            connection,
            concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
            limiter: {
                max: 10, // Max 10 jobs
                duration: 1000 // Per second
            }
        });

        // Lifecycle: Job started
        worker.on('active', (job) => {
            recordJobStart(name, WORKER_ID);
            logger.info({ jobId: job.id, queue: name, worker: WORKER_ID }, 'Job started processing');
        });

        // Lifecycle: Job completed
        worker.on('completed', async (job) => {
            logger.info({ jobId: job.id, queue: name }, 'Job completed');
            if (this.webhookDispatcher) {
                await this.webhookDispatcher.dispatch('job.completed', job.returnvalue);
            }
        });

        // Lifecycle: Job failed
        worker.on('failed', async (job, err) => {
            logger.error({ jobId: job?.id, queue: name, err, worker: WORKER_ID }, 'Job failed');

            // Classify error and record metrics
            if (job) {
                const appError = toApplicationError(err);
                const classification = classifyError(appError);

                recordFailedJob(name, classification.category, WORKER_ID);
            }

            if (this.webhookDispatcher) {
                await this.webhookDispatcher.dispatch('job.failed', {
                    jobId: job?.id,
                    queue: name,
                    error: err.message
                });
            }
        });

        // Lifecycle: Job stalled
        worker.on('stalled', (jobId) => {
            recordStalledJob(name, WORKER_ID);
            logger.warn({ jobId, queue: name, worker: WORKER_ID }, 'Job stalled - may have crashed or exceeded timeout');
        });

        this.workers.set(name, worker);
        logger.info(`Worker initialized: ${name} (ID: ${WORKER_ID})`);

        // Start health monitoring on first worker initialization
        if (this.workers.size === 1) {
            startWorkerHealthMonitoring(WORKER_ID);
            logger.info({ worker: WORKER_ID }, 'Worker health monitoring started');
        }
    }

    /**
     * Process Scrape Job with Full Observability
     */
    private async processScrapeJob(job: Job<JobData>) {
        this.ensureInitialized();
        const startTime = Date.now();
        const { url, scraperType, options, traceId, metadata } = job.data;

        // Extract and setup tracing context from job
        const store = extractFromJob(job.data);

        return contextStorage.run(store, async () => {
            logger.info({
                jobId: job.id,
                attemptNumber: job.attemptsMade + 1
            }, 'Processing scrape job');

            if (!url || !scraperType) {
                const error = new Error('Missing url or scraperType');
                throw enhanceErrorContext(error, {
                    jobId: job.id as string,
                    failurePoint: FailurePoint.WORKER_INIT,
                    attemptNumber: job.attemptsMade + 1
                });
            }

            // Domain Rate Limiting (Phase 1 Hardening)
            try {
                const domain = new URL(url).hostname;
                const { dragonfly } = await import('@nx-scraper/shared');
                const client = dragonfly.getClient();
                const key = `ratelimit:domain:${domain}`;
                const limit = 20; // 20 requests per minute per domain (conservative default)

                const current = await client.incr(key);
                if (current === 1) {
                    await client.expire(key, 60);
                }

                if (current > limit) {
                    logger.warn({ domain, current, limit }, '⚠️ Domain rate limit exceeded (throttling)');
                    // Throwing error triggers BullMQ exponential backoff (2s, 4s, 8s...)
                    throw enhanceErrorContext(
                        new Error(`Rate limit exceeded for ${domain}`),
                        {
                            jobId: job.id as string,
                            url,
                            failurePoint: FailurePoint.RATE_LIMIT_CHECK,
                            attemptNumber: job.attemptsMade + 1
                        }
                    );
                }
            } catch (error: unknown) {
                // If URL parsing fails, just log and continue (or fail job if critical)
                if (error instanceof Error && error.message.includes('Rate limit exceeded')) throw error;
                logger.warn({ error, url }, 'Failed to check domain rate limit - proceeding with caution');
            }

            // Proxy Injection (Phase 2 Resilience)
            let proxyConfig;
            const scrapeOptions = options as Record<string, unknown>;

            if (!scrapeOptions.proxy) {
                // Determine type: Heavy/Google scrapers might prefer residential in future
                // For now, respect options.proxyType if present, else default to datacenter
                const type = scrapeOptions.proxyType as ProxyType || 'datacenter';
                proxyConfig = await proxyManager.getNextProxy(type);

                if (proxyConfig) {
                    scrapeOptions.proxy = proxyConfig.url;
                    logger.debug({ proxyId: proxyConfig.id, type }, 'Injecting proxy');

                    // Add proxy to context for logging
                    store.set('proxyId', proxyConfig.id);
                }
            }

            try {
                const result = await scraperManager.runScraper(scraperType, {
                    url,
                    ...(options as Record<string, unknown>)
                });

                // Report Proxy Success
                if (proxyConfig) {
                    if (result.success) {
                        // Update latency if metadata available
                        proxyManager.reportSuccess(proxyConfig.id);
                    } else {
                        // If result.success is false, it might be a block
                        proxyManager.reportFailure(proxyConfig.id, result.error || 'Scrape failure');
                    }
                }

                // Record metrics
                const duration = Date.now() - startTime;
                recordJobComplete('scrape-queue', result.success ? 'success' : 'failure', duration, WORKER_ID);

                if (this.metricsRecorder) {
                    this.metricsRecorder.recordScrapeMetrics(
                        result.success,
                        scraperType,
                        result.metadata.executionTimeMs || 0
                    );
                }

                return result;

            } catch (error: unknown) {
                // ENHANCED ERROR HANDLING
                const appError = toApplicationError(error);
                const classification = classifyError(appError, FailurePoint.SCRAPER_PARSE);

                // Enhance error with full context
                const enhancedError = enhanceErrorContext(appError, {
                    url,
                    scraper: scraperType,
                    jobId: job.id as string,
                    attemptNumber: job.attemptsMade + 1,
                    proxyId: proxyConfig?.id
                });

                // Record detailed metrics
                recordWorkerError(
                    classification.category,
                    appError.code,
                    classification.failurePoint,
                    scraperType,
                    WORKER_ID
                );

                // Record job completion as failure
                const duration = Date.now() - startTime;
                recordJobComplete('scrape-queue', 'failure', duration, WORKER_ID);

                // Log with classification
                logClassifiedError(enhancedError, {
                    jobId: job.id,
                    classification,
                    attemptNumber: job.attemptsMade + 1
                });

                // Report Proxy Failure on critical error
                if (proxyConfig) {
                    const errorMsg = enhancedError.message;
                    proxyManager.reportFailure(proxyConfig.id, errorMsg);
                }

                // Re-throw enhanced error for BullMQ retry logic
                throw enhancedError;
            }
        }).then(async (result) => {
            // AI Bridge Implementation
            const safeOptions = options as Record<string, unknown>;
            const features = Array.isArray(safeOptions.features) ? safeOptions.features : [];
            if (result && result.success && features.includes('ai-processing')) {
                logger.info({ jobId: job.id }, '🤖 Starting AI Post-Processing...');

                try {
                    const aiEngine = container.resolve(Tokens.AIEngine);
                    const aiResult = await aiEngine.runPipeline({
                        url: url || '',
                        html: (result.data?.html || '') as string,
                        screenshot: result.data?.screenshot,
                        features: ['understand', 'schema', 'strategy', 'validate'],
                        options: options as Record<string, unknown>
                    });

                    // RAG Ingestion (Self-Learning)
                    if (aiResult.schema?.success && aiResult.schema.data) {
                        try {
                            const extractedType = aiResult.schema.data.schemaType;
                            // Ingest content for Search
                            await knowledgeBase.ingestContent({
                                url: url as string,
                                content: JSON.stringify(aiResult.schema.data.normalizedSchema),
                                type: extractedType.toLowerCase() as 'job' | 'product' | 'article' | 'other',
                                title: aiResult.understanding?.data?.title || '',
                                metadata: {
                                    date: new Date().toISOString(),
                                    fieldCount: Object.keys(aiResult.schema.data.normalizedSchema || {}).length
                                }
                            });

                            // Learn Strategy (if we used selectors)
                            if (result.success && result.data?.html) {
                                // Simplified strategy learning: just counting success for this domain
                                // In a real scenario, we'd store the actual selectors used from aiResult.selectors
                            }
                        } catch (ragError) {
                            logger.warn({ error: ragError }, 'RAG Ingestion failed (non-critical)');
                        }
                    }

                    // Merge AI results into final job output
                    return {
                        ...result,
                        ai: aiResult
                    };
                } catch (aiError: unknown) {
                    const appError = toApplicationError(aiError);
                    const classification = classifyError(appError, FailurePoint.AI_PROCESSING);

                    logger.error({
                        error: appError.toJSON(),
                        classification,
                        jobId: job.id
                    }, 'AI Processing Failed');

                    // We don't fail the whole job if AI fails, we just return scrape data with AI error
                    return {
                        ...result,
                        ai: {
                            success: false,
                            error: appError.message,
                            errorCode: appError.code,
                            category: classification.category
                        }
                    };
                }
            }
            return result;
        });
    }

    /**
     * Process AI Job
     */
    private async processAIJob(job: Job<JobData>) {
        this.ensureInitialized();
        const { url, html, features, options } = job.data;
        logger.info({ jobId: job.id, url }, 'Processing AI job');

        const aiEngine = container.resolve(Tokens.AIEngine);
        const result = await aiEngine.runPipeline({
            url: url || 'unknown',
            html: html || '',
            features: (features as ('understand' | 'selectors' | 'schema' | 'strategy' | 'anti-blocking' | 'validate' | 'extract')[]) || [],
            options: options as AIModuleOptions
        });

        return result;
    }

    /**
     * Graceful shutdown
     */
    async close() {
        for (const worker of this.workers.values()) {
            await worker.close();
        }
    }
}

export const queueWorker = new QueueWorker();
