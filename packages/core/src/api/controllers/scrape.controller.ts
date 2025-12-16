import { Request, Response, NextFunction } from 'express';
import { logger, ScrapeRequestSchema } from '@nx-scraper/shared';
import { webhookManager } from '../../webhooks/webhook-manager.js';
import { successResponse, PaginationSchema, getPaginationMeta, APIKeyData } from '@nx-scraper/shared';
import { ScrapeService } from '../../services/scrape.service.js';

export class ScrapeController {
    private service: ScrapeService;

    constructor() {
        this.service = new ScrapeService();
    }

    /**
     * Handle scrape request (Async via Queue)
     */
    async scrape(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate request with Zod
            const validated = ScrapeRequestSchema.parse(req.body);
            const authenticatedReq = req as Request & { apiKey?: APIKeyData };

            const result = await this.service.submitJob(
                {
                    url: validated.url,
                    scraperType: validated.scraperType,
                    options: { ...validated.options, url: validated.url }
                },
                {
                    requestId: (req.id as string) || 'unknown',
                    userId: (req as any).user?.id,
                    apiKey: authenticatedReq.apiKey,
                    correlationId: (req as any).correlationId
                }
            );

            // Dispatch Webhook (Async)
            if (!result.isExisting) {
                webhookManager.dispatch('job.created', {
                    jobId: result.jobId,
                    url: validated.url,
                    scraperType: validated.scraperType,
                    timestamp: new Date().toISOString()
                }).catch(err => logger.warn({ err, jobId: result.jobId }, 'Failed to dispatch job.created webhook'));
            }

            // Return 202 Accepted (or 200 OK if existing) with Job ID
            const status = result.isExisting ? 200 : 202;
            res.status(status).json(successResponse({
                jobId: result.jobId,
                statusUrl: `/api/v1/jobs/${result.jobId}?type=scrape`,
                isExisting: result.isExisting
            }, { requestId: (req.id as string) || 'unknown' }));

        } catch (error: unknown) {
            next(error);
        }
    }

    /**
     * List available scrapers with pagination
     */
    listScrapers(req: Request, res: Response, next: NextFunction) {
        try {
            // Validate pagination params
            const pagination = PaginationSchema.parse(req.query);
            const offset = (pagination.page - 1) * pagination.limit;

            const { scrapers, total } = this.service.getAvailableScrapers(offset, pagination.limit);

            return res.json(successResponse(
                { scrapers },
                {
                    requestId: (req.id as string) || 'unknown',
                    ...getPaginationMeta(total, pagination)
                }
            ));
        } catch (error: unknown) {
            next(error);
        }
    }
}

