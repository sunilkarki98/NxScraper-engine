import { z } from 'zod';

/**
 * Scrape Request Validation Schema
 */
export const ScrapeRequestSchema = z.object({
    url: z.string().url('Invalid URL format'),
    scraperType: z.enum([
        'universal-scraper',
        'google-scraper',
        'heavy-scraper',
        'google-places',
        'ai',
        'auto' // Let routing logic decide
    ]).default('auto'),
    options: z.object({
        waitForSelector: z.string().optional(),
        timeout: z.number().min(1000).max(120000).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        proxy: z.string().optional(),
        cookies: z.array(z.any()).optional(),
        features: z.array(z.string()).optional()
    }).optional().default({})
});

export type ScrapeRequest = z.infer<typeof ScrapeRequestSchema>;

/**
 * Agent Execute Request Schema
 */
export const AgentExecuteSchema = z.object({
    url: z.string().url('Invalid URL format'),
    goal: z.string().min(10, 'Goal must be at least 10 characters').max(500, 'Goal too long'),
    mode: z.enum(['smart', 'autonomous', 'fast', 'agent']).default('smart')
});

export type AgentExecuteRequest = z.infer<typeof AgentExecuteSchema>;

/**
 * Validation Error Response
 */
export function formatValidationError(error: z.ZodError) {
    return {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.issues.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
        }))
    };
}
