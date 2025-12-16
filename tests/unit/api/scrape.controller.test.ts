import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrapeController } from '@core/api/controllers/scrape.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';
import { z } from 'zod';

// Mock dependencies
vi.mock('@nx-scraper/shared', () => ({
    queueManager: {
        addJob: vi.fn().mockResolvedValue({ id: 'job-123' }),
        getMetrics: vi.fn().mockResolvedValue({ waiting: 0 }),
    },
    // Mock Container
    container: {
        resolve: vi.fn().mockReturnValue({
            addJob: vi.fn().mockResolvedValue({ id: 'job-123' }),
            getMetrics: vi.fn().mockResolvedValue({ waiting: 0 }),
        })
    },
    Tokens: {
        QueueManager: 'QueueManager'
    },
    cacheService: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(true),
    },
    ScrapeRequestSchema: {
        parse: (obj: any) => {
            if (!obj.url) throw new z.ZodError([{ code: 'custom', path: ['url'], message: 'Required' }]);
            return {
                url: obj.url,
                scraperType: obj.scraperType || 'universal-scraper',
                options: obj.options || {}
            };
        }
    },
    successResponse: (data: any) => ({ success: true, data }),
    errorResponse: (code: string, message: string) => ({ success: false, error: { code, message } }),
    PaginationSchema: {
        parse: () => ({ page: 1, limit: 10 })
    },
    getPaginationMeta: () => ({ page: 1 }),
    toAppError: (err: any) => ({ statusCode: 500, code: 'INTERNAL_ERROR', message: err.message, context: {} }),
    logError: vi.fn(),
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    },
    env: {} // Add missing env export
}));

// Mock crypto
vi.mock('crypto', () => ({
    default: {
        createHash: () => ({
            update: () => ({
                digest: () => 'mock-hash'
            })
        })
    }
}));

vi.mock('@core/plugins/plugin-manager.js', () => ({
    pluginManager: {
        getAll: vi.fn().mockReturnValue([
            { name: 'universal-scraper', version: '1.0.0' },
            { name: 'google-scraper', version: '1.0.0' },
        ]),
    },
}));

describe('ScrapeController', () => {
    let controller: ScrapeController;

    beforeEach(() => {
        controller = new ScrapeController();
        vi.clearAllMocks();
    });

    describe('scrape', () => {
        it('should return 400 if URL is missing', async () => {
            const req = createMockRequest({});
            const res = createMockResponse();

            const next = vi.fn();
            await controller.scrape(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(z.ZodError));
            // res.status not called because controller delegates to middleware
            expect(res.status).not.toHaveBeenCalled();
        });

        it('should queue scrape job successfully', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
                scraperType: 'universal-scraper',
            });
            const res = createMockResponse();

            const next = vi.fn();
            await controller.scrape(req, res, next);

            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        jobId: 'job-123',
                    }),
                })
            );
        });

        it('should use default scraper type', async () => {
            const req = createMockRequest({
                url: 'https://example.com',
            });
            const res = createMockResponse();

            const next = vi.fn();
            await controller.scrape(req, res, next);

            expect(res.status).toHaveBeenCalledWith(202);
        });
    });

    describe('listScrapers', () => {
        it('should return list of scrapers', () => {
            const req = createMockRequest({}, { page: '1', limit: '20' });
            const res = createMockResponse();

            controller.listScrapers(req, res);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: true,
                    data: expect.objectContaining({
                        scrapers: expect.arrayContaining([
                            expect.objectContaining({
                                name: 'universal-scraper',
                            }),
                        ]),
                    }),
                })
            );
        });

        it('should handle pagination', () => {
            const req = createMockRequest({}, { page: '2', limit: '10' });
            const res = createMockResponse();

            controller.listScrapers(req, res);

            expect(res.json).toHaveBeenCalled();
        });
    });
});
