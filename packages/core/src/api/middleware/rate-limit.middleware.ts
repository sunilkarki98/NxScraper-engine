import { Request, Response, NextFunction } from 'express';
import { rateLimiter } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

/**
 * Per-API-key rate limiting middleware
 * Must be used AFTER requireAPIKey middleware
 */
export async function apiKeyRateLimit(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const keyData = req.apiKey;

        if (!keyData) {
            // No API key attached - auth middleware should have run first
            logger.warn('Rate limit middleware called without API key');
            return next();
        }

        // Use API key ID as the rate limit identifier
        const result = await rateLimiter.checkLimit(keyData.id, {
            maxRequests: keyData.rateLimit.maxRequests,
            windowSeconds: keyData.rateLimit.windowSeconds,
            strategy: 'sliding'
        });

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', keyData.rateLimit.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

        if (!result.allowed) {
            const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
            res.setHeader('Retry-After', retryAfter.toString());

            logger.warn({
                keyId: keyData.id,
                tier: keyData.tier,
                path: req.path
            }, 'Rate limit exceeded');

            res.status(429).json({
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Limit: ${keyData.rateLimit.maxRequests} requests per ${keyData.rateLimit.windowSeconds / 60} minutes`,
                retryAfter
            });
            return;
        }

        next();
    } catch (error) {
        logger.error({ error, path: req.path }, 'Rate limit middleware error');
        // Continue on error to not block requests
        next();
    }
}
