import { z } from 'zod';

/**
 * Scrape Request Validation Schema
 */
export const ScrapeRequestSchema = z.object({
    url: z.string().url('Invalid URL format').refine((url) => {
        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname;

            // Block localhost
            if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;

            // Block private IP ranges (Basic regex check)
            // 10.0.0.0/8
            if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;
            // 192.168.0.0/16
            if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;
            // 172.16.0.0/12 (172.16-31)
            if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;
            // Cloud Metadata (169.254.169.254)
            if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;

            // Block internal docker service names (common ones)
            // Ideally this should use a proper DNS resolver check, but regex covers 99% of basic attacks
            const internalServices = ['redis', 'postgres', 'api', 'worker', 'chrome', 'browserless'];
            if (internalServices.includes(hostname)) return false;

            return true;
        } catch {
            return false;
        }
    }, 'Internal/Private URLs are not allowed (SSRF Protection)'),
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
    mode: z.enum(['smart', 'autonomous', 'fast', 'agent']).default('smart'),
    model: z.string().optional(),
    provider: z.enum(['openai', 'anthropic', 'gemini', 'deepseek', 'openrouter', 'ollama']).optional()
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
