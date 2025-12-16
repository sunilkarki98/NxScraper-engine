import { container, Tokens, QueueManager, logger, ScrapeRequestSchema, ScrapeOptions, QueueMetrics, APIKeyData, cacheService } from '@nx-scraper/shared';
import { pluginManager } from '../plugins/plugin-manager.js';
import crypto from 'crypto';

export class ScrapeService {
    private queueManager: QueueManager;

    // Simple in-memory cache for queue metrics
    private metricsCache: { [key: string]: { data: QueueMetrics, timestamp: number } } = {};

    constructor(queueManager?: QueueManager) {
        this.queueManager = queueManager || container.resolve(Tokens.QueueManager);
    }

    /**
     * Submit a new scrape job
     */
    async submitJob(
        input: { url: string, scraperType: string, options: ScrapeOptions },
        metadata: { requestId: string, userId?: string, apiKey?: APIKeyData, correlationId?: string }
    ): Promise<{ jobId: string, isExisting: boolean }> {

        // 1. Idempotency Check
        const stablePayload = JSON.stringify({
            url: input.url,
            type: input.scraperType,
            options: input.options
        }, Object.keys({
            url: input.url,
            type: input.scraperType,
            options: input.options
        }).sort());

        const paramsHash = crypto.createHash('md5').update(stablePayload).digest('hex');
        const cacheKey = `job_dedupe:${paramsHash}`;
        const existingJobId = await cacheService.get(cacheKey) as string | null;

        if (existingJobId) {
            logger.info({ jobId: existingJobId, url: input.url }, '♻️ Returning existing active job (Idempotency)');
            return { jobId: existingJobId, isExisting: true };
        }

        // 2. Queue Health Check
        const queueMetrics = await this.getCachedQueueMetrics('scrape');
        if (queueMetrics.waiting > 100) {
            logger.warn({ waiting: queueMetrics.waiting }, 'Queue high load warning');
        }

        // 3. Resolve Scraper Name
        const internalScraperName = this.resolveScraperName(input.scraperType) || 'UniversalScraper';

        // 4. Determine Priority
        const priority = this.calculatePriority(metadata.apiKey);

        // 5. Configure Options (e.g. enable AI)
        const options = { ...input.options };
        if (input.scraperType === 'ai') {
            options.features = options.features || [];
            if (!options.features.includes('ai-processing')) {
                options.features.push('ai-processing');
            }
        }

        // 6. Submit to Queue
        const jobData = {
            url: input.url,
            scraperType: internalScraperName,
            options: options,
            priority,
            traceId: metadata.correlationId || metadata.requestId,
            metadata: {
                correlationId: metadata.correlationId,
                requestId: metadata.requestId,
                userId: metadata.userId,
                source: 'api'
            }
        };

        const job = await this.queueManager.addJob('scrape', jobData, {
            priority,
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: true,
            removeOnFail: false
        });

        // 7. Cache Job ID
        await cacheService.set(cacheKey, job.id, 10);

        logger.info({
            jobId: job.id,
            url: input.url,
            scraperType: internalScraperName,
            requestId: metadata.requestId
        }, 'Scrape job queued (Reliable)');

        return { jobId: job.id as string, isExisting: false };
    }

    /**
     * List available scrapers
     */
    getAvailableScrapers(offset: number, limit: number) {
        const allScrapers = pluginManager.getAll();
        const total = allScrapers.length;

        const scrapers = allScrapers
            .slice(offset, offset + limit)
            .map((s: any) => ({
                name: s.name,
                version: s.version
            }));

        return { scrapers, total };
    }

    /**
     * Resolve public scraper type to internal class name
     */
    private resolveScraperName(requestedType: string): string | undefined {
        const availableScrapers = pluginManager.getAll();
        const type = requestedType.toLowerCase();
        let internalName: string | undefined;

        // 1. Dynamic Match
        const matched = availableScrapers.find((s: any) =>
            s.name.toLowerCase() === type ||
            s.name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() === type
        );

        if (matched) {
            internalName = matched.name;
        } else if (type === 'ai') {
            internalName = 'UniversalScraper';
        } else if (type === 'auto') {
            internalName = undefined; // Router decides
        }

        // 2. Legacy/Alias Fallback (Managed via Plugin Capabilities or Aliases if needed)
        // For now, if no internal name matches, we rely on the dynamic match or return undefined.
        // The PluginManager's registry is the single source of truth.

        // If the user passed a "slug" style name (e.g. google-places), we try to find it by normalizing
        if (!internalName) {
            const normalized = availableScrapers.find(s =>
                s.name.toLowerCase() === type.replace(/-/g, '').toLowerCase() ||
                s.name.toLowerCase().includes(type.replace(/-/g, '').toLowerCase())
            );
            if (normalized) internalName = normalized.name;
        }

        return internalName;
    }

    /**
     * Calculate job priority based on API Key
     */
    private calculatePriority(apiKey?: APIKeyData): number {
        let priority = 100; // Default
        if (apiKey) {
            if (apiKey.role === 'admin') priority = 10;
            else if (apiKey.tier === 'pro') priority = 50;
        }
        return priority;
    }

    /**
     * Get cached metrics
     */
    private async getCachedQueueMetrics(type: 'scrape') {
        const CACHE_TTL = 5000;
        const now = Date.now();
        const cached = this.metricsCache[type];

        if (cached && (now - cached.timestamp < CACHE_TTL)) {
            return cached.data;
        }

        const metrics = await this.queueManager.getMetrics(type);
        this.metricsCache[type] = { data: metrics, timestamp: now };
        return metrics;
    }
}
