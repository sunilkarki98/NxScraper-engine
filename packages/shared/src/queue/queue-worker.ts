import { Worker, Job } from 'bullmq';
import { queueManager, JobData } from './queue-manager.js';
import { scraperManager } from '../worker/scraper-manager.js';
import { getAIEngine, AIModuleOptions } from '../ai/ai-engine.js';
import logger from '../utils/logger.js';
import { env } from '../utils/env-validator.js';
import { IMetricsRecorder } from '../types/metrics.interface.js';
import { IWebhookDispatcher } from '../types/webhook.interface.js';

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

    private initializeWorker(name: string, processor: (job: Job) => Promise<any>) {
        const connection = queueManager.getConnectionConfig();

        const worker = new Worker(name, processor, {
            connection,
            concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
            limiter: {
                max: 10, // Max 10 jobs
                duration: 1000 // Per second
            }
        });

        worker.on('completed', async (job) => {
            logger.info({ jobId: job.id, queue: name }, 'Job completed');
            if (this.webhookDispatcher) {
                await this.webhookDispatcher.dispatch('job.completed', job.returnvalue);
            }
        });

        worker.on('failed', async (job, err) => {
            logger.error({ jobId: job?.id, queue: name, err }, 'Job failed');
            if (this.webhookDispatcher) {
                await this.webhookDispatcher.dispatch('job.failed', { jobId: job?.id, queue: name, error: err.message });
            }
        });

        this.workers.set(name, worker);
        logger.info(`Worker initialized: ${name}`);
    }

    /**
     * Process Scrape Job
     */
    private async processScrapeJob(job: Job<JobData>) {
        this.ensureInitialized();
        const { url, scraperType, options } = job.data;
        logger.info({ jobId: job.id, url }, 'Processing scrape job');

        if (!url || !scraperType) {
            throw new Error('Missing url or scraperType');
        }

        const result = await scraperManager.runScraper(scraperType, {
            url,
            ...(options as Record<string, unknown>)
        });

        if (this.metricsRecorder) {
            this.metricsRecorder.recordScrapeMetrics(
                result.success,
                scraperType,
                result.metadata.executionTimeMs || 0
            );
        }

        return result;
    }

    /**
     * Process AI Job
     */
    private async processAIJob(job: Job<JobData>) {
        this.ensureInitialized();
        const { url, html, features, options } = job.data;
        logger.info({ jobId: job.id, url }, 'Processing AI job');

        const aiEngine = getAIEngine();
        const result = await aiEngine.runPipeline({
            url: url || 'unknown',
            html: html || '',
            features: features as any,
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
