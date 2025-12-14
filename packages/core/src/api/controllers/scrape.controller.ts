import { Request, Response } from 'express';
import { queueManager, logger, ScrapeOptions, ScrapeResult, APIKeyData, QueueMetrics } from '@nx-scraper/shared';
import { webhookManager } from '../../webhooks/webhook-manager.js';
import { pluginManager } from '../../plugins/plugin-manager.js';
import { ScrapeRequestSchema } from '@nx-scraper/shared';
import { successResponse, errorResponse, PaginationSchema, getPaginationMeta, cacheService } from '@nx-scraper/shared';
import { z } from 'zod';
import { toAppError, logError } from '@nx-scraper/shared';
import crypto from 'crypto';

// Mapping from public API names (kebab-case) to internal Plugin names (PascalCase)
const SCRAPER_MAP: Record<string, string | undefined> = {
    'universal-scraper': 'UniversalScraper',
    'heavy-scraper': 'HeavyScraper',
    'google-scraper': 'GoogleScraper',
    'google-places': 'GooglePlacesScraper', // Assuming this name
    'ai': 'UniversalScraper', // AI requests use Universal Scraper with AI features
    'auto': undefined // Let worker router decide
};

export class ScrapeController {
    /**
     * Handle scrape request (Async via Queue)
     */
    async scrape(req: Request, res: Response) {
        try {
            // Validate request with Zod
            const validated = ScrapeRequestSchema.parse(req.body);

            // Idempotency: Generate a hash of the request parameters
            // Use deterministic key ordering for stable hash
            const stablePayload = JSON.stringify({
                url: validated.url,
                type: validated.scraperType,
                options: validated.options
            }, Object.keys({
                url: validated.url,
                type: validated.scraperType,
                options: validated.options
            }).sort());

            const paramsHash = crypto.createHash('md5').update(stablePayload).digest('hex');

            const cacheKey = `job_dedupe:${paramsHash}`;
            const existingJobId = await cacheService.get(cacheKey);

            if (existingJobId) {
                logger.info({ jobId: existingJobId, url: validated.url }, '♻️ Returning existing active job (Idempotency)');
                return res.status(200).json(successResponse({
                    jobId: existingJobId,
                    statusUrl: `/api/v1/jobs/${existingJobId}?type=scrape`,
                    isExisting: true
                }, { requestId: req.id }));
            }

            // Check Queue Capacity (Soft limit)
            // Optimization: Cache metrics/check to avoid Redis round-trip on every request
            const queueMetrics = await this.getCachedQueueMetrics('scrape');
            if (queueMetrics.waiting > 100) {
                logger.warn({ waiting: queueMetrics.waiting }, 'Queue high load warning');
            }

            // Determine Priority based on API Key Tier
            // Lower number = higher priority
            let priority = 100; // Default (Free/Hobby)

            const authenticatedReq = req as Request & { apiKey?: APIKeyData };

            if (authenticatedReq.apiKey) {
                if (authenticatedReq.apiKey.role === 'admin') priority = 10;
                else if (authenticatedReq.apiKey.tier === 'pro') priority = 50;
            }

            // Map the requested scraperType to internal name
            // If 'auto' or mapped value is undefined, worker will use Router
            const internalScraperName = SCRAPER_MAP[validated.scraperType];

            // If user specifically requested 'ai', ensure AI features are enabled in options
            const options = { ...validated.options };
            if (validated.scraperType === 'ai') {
                options.features = options.features || [];
                if (!options.features.includes('ai-processing')) {
                    options.features.push('ai-processing'); // Flag for worker to enable AI pipeline
                }
            }

            // Add job to queue with priority
            const job = await queueManager.addJob('scrape', {
                url: validated.url,
                scraperType: internalScraperName, // Send the PascalCase internal name
                options: options,
                priority
            }, {
                priority
            });

            // Cache the job ID for short duration (e.g. 10 seconds) to prevent double-clicks
            await cacheService.set(cacheKey, job.id, 10);

            logger.info({
                jobId: job.id,
                url: validated.url,
                scraperType: validated.scraperType,
                requestId: req.id
            }, 'Scrape job queued');

            // Dispatch Webhook (Async)
            webhookManager.dispatch('job.created', {
                jobId: job.id,
                url: validated.url,
                scraperType: validated.scraperType,
                timestamp: new Date().toISOString()
            }).catch(err => logger.warn({ err, jobId: job.id }, 'Failed to dispatch job.created webhook'));

            // Return 202 Accepted with Job ID
            res.status(202).json(successResponse({
                jobId: job.id,
                statusUrl: `/api/v1/jobs/${job.id}?type=scrape`
            }, { requestId: req.id }));

        } catch (error: unknown) {
            if (error instanceof z.ZodError) {
                return res.status(400).json(errorResponse(
                    'VALIDATION_ERROR',
                    'Invalid request parameters',
                    error.issues.map((err: z.ZodIssue) => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                ));
            }

            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'scrape' });

            res.status(appError.statusCode).json(errorResponse(
                appError.code,
                appError.message,
                appError.context
            ));
        }
    }

    /**
     * List available scrapers with pagination
     */
    listScrapers(req: Request, res: Response) {
        try {
            // Validate pagination params
            const pagination = PaginationSchema.parse(req.query);

            const allScrapers = pluginManager.getAll();
            const total = allScrapers.length;
            const offset = (pagination.page - 1) * pagination.limit;

            // Paginate results
            const scrapers = allScrapers
                .slice(offset, offset + pagination.limit)
                .map(s => ({
                    name: s.name,
                    version: s.version
                }));

            return res.json(successResponse(
                { scrapers },
                {
                    requestId: req.id,
                    ...getPaginationMeta(total, pagination)
                }
            ));
        } catch (error: unknown) {
            if (error instanceof z.ZodError) {
                return res.status(400).json(errorResponse(
                    'VALIDATION_ERROR',
                    'Invalid pagination parameters',
                    error.issues
                ));
            }

            const appError = toAppError(error);
            logError(error, { requestId: req.id, endpoint: 'listScrapers' });

            return res.status(appError.statusCode).json(errorResponse(
                appError.code,
                'Failed to retrieve scrapers'
            ));
        }
    }

    // Simple in-memory cache for queue metrics to reduce Redis load
    private metricsCache: { [key: string]: { data: QueueMetrics, timestamp: number } } = {};

    private async getCachedQueueMetrics(type: 'scrape') {
        const CACHE_TTL = 5000; // 5 seconds
        const now = Date.now();
        const cached = this.metricsCache[type];

        if (cached && (now - cached.timestamp < CACHE_TTL)) {
            return cached.data;
        }

        const metrics = await queueManager.getMetrics(type);
        this.metricsCache[type] = { data: metrics, timestamp: now };
        return metrics;
    }
}
