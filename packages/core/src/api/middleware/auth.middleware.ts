import { Request, Response, NextFunction } from 'express';
import { apiKeyManager, env, logger, APIKeyData } from '@nx-scraper/shared';

// Extend Express Request type to include API key data
declare global {
    namespace Express {
        interface Request {
            apiKey?: APIKeyData;
        }
    }
}

/**
 * Extract API key from request headers
 */
function extractAPIKey(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    // Check x-api-key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
        return apiKeyHeader;
    }

    return null;
}

/**
 * Middleware to require API key authentication
 */
export async function requireAPIKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const apiKey = extractAPIKey(req);

        if (!apiKey) {
            logger.warn({ path: req.path, ip: req.ip }, 'Request missing API key');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'API key required. Include in Authorization header as "Bearer <key>" or x-api-key header.'
            });
            return;
        }



        // Validate the API key

        const keyData = await apiKeyManager.validateKey(apiKey);

        if (!keyData) {
            logger.warn({ path: req.path, ip: req.ip }, 'Invalid API key attempt');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or revoked API key'
            });
            return;
        }

        if (!keyData.isActive) {
            logger.warn({ keyId: keyData.id, path: req.path }, 'Revoked API key attempt');
            res.status(403).json({
                error: 'Forbidden',
                message: 'API key has been revoked'
            });
            return;
        }

        // Attach key data to request for downstream use
        req.apiKey = keyData;

        // Update usage statistics asynchronously (don't await)
        apiKeyManager.updateKeyStats(keyData.id).catch(err =>
            logger.warn({ err, keyId: keyData.id }, 'Failed to update key stats')
        );

        next();
    } catch (error) {
        logger.error({ error, path: req.path }, 'Authentication middleware error');
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Authentication failed'
        });
    }
}

/**
 * Optional middleware - continues even without valid API key
 * Useful for endpoints that have both public and authenticated behavior
 */
export async function optionalAPIKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const apiKey = extractAPIKey(req);

        if (apiKey) {
            const keyData = await apiKeyManager.validateKey(apiKey);
            if (keyData && keyData.isActive) {
                req.apiKey = keyData;
                apiKeyManager.updateKeyStats(keyData.id).catch((err) => {
                    // Fire-and-forget but log failures for debugging
                    logger.debug({
                        err,
                        keyId: keyData.id,
                        path: req.path
                    }, 'Failed to update key stats (non-critical)');
                });
            }
        }

        next();
    } catch (error) {
        // Continue even on error for optional auth
        logger.warn({ error }, 'Optional auth middleware error');
        next();
    }
}

/**
 * Middleware to require Admin role
 */
export async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    if (!req.apiKey || req.apiKey.role !== 'admin') {
        logger.warn({ path: req.path, keyId: req.apiKey?.id }, 'Admin access denied');
        res.status(403).json({
            error: 'Forbidden',
            message: 'Admin privileges required'
        });
        return;
    }
    next();
}
