import { Queue, QueueEvents, Job, JobsOptions } from 'bullmq';
import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import { env } from '../utils/env-validator.js';

export type JobType = 'scrape' | 'ai-pipeline';

export interface JobData {
    url?: string;
    scraperType?: string;
    options?: unknown;
    html?: string;
    features?: string[];
    priority?: number;
    [key: string]: unknown;
}

export interface QueueMetrics {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
}

export class QueueManager {
    private queues: Map<string, Queue> = new Map();
    private queueEvents: Map<string, QueueEvents> = new Map();
    private initialized = false;

    constructor() {
        // Deferred initialization
    }

    private ensureInitialized() {
        if (this.initialized) return;
        this.initialized = true;
        this.initializeQueue('scrape-queue');
        this.initializeQueue('ai-queue');
    }

    private initializeQueue(name: string) {
        // Use validated environment configuration
        const connection = this.getConnectionConfig();

        const queue = new Queue(name, { connection });
        const events = new QueueEvents(name, { connection });

        this.queues.set(name, queue);
        this.queueEvents.set(name, events);

        logger.info(`Queue initialized: ${name}`);
    }

    /**
     * Add a job to the queue
     */
    async addJob(type: JobType, data: JobData, options: JobsOptions = {}): Promise<Job> {
        this.ensureInitialized();
        const queueName = type === 'scrape' ? 'scrape-queue' : 'ai-queue';
        const queue = this.queues.get(queueName);

        if (!queue) {
            throw new Error(`Queue not found for type: ${type}`);
        }

        const job = await queue.add(type, data, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 1000
            },
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 500,     // Keep last 500 failed jobs
            // Force include timeout even if types are outdated
            ...({ timeout: 300000 } as any),
            ...options
        });

        logger.info({ jobId: job.id, type }, 'Job added to queue');
        return job;
    }

    /**
     * Get Job by ID
     */
    async getJob(type: JobType, jobId: string): Promise<Job | undefined> {
        const queueName = type === 'scrape' ? 'scrape-queue' : 'ai-queue';
        const queue = this.queues.get(queueName);
        if (!queue) return undefined;
        return await queue.getJob(jobId);
    }

    /**
     * Get Queue Metrics
     */
    async getMetrics(type: JobType): Promise<QueueMetrics> {
        const queueName = type === 'scrape' ? 'scrape-queue' : 'ai-queue';
        this.ensureInitialized();
        const queue = this.queues.get(queueName);

        if (!queue) {
            return { waiting: 0, active: 0, completed: 0, failed: 0 };
        }

        const counts = await queue.getJobCounts('wait', 'active', 'completed', 'failed');
        return {
            waiting: counts.wait,
            active: counts.active,
            completed: counts.completed,
            failed: counts.failed
        };
    }

    /**
     * Get queue connection config (for workers)
     */
    getConnectionConfig(dragonflyUrl?: string) {
        // Use validated environment instead of hardcoded defaults
        const url = new URL(dragonflyUrl || env.DRAGONFLY_URL);

        return {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            password: url.password || undefined,
            username: url.username || undefined,
            db: url.pathname ? parseInt(url.pathname.substring(1)) : 0,
        };
    }
}

export const queueManager = new QueueManager();
