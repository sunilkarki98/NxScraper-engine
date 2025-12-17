import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { contextStorage, extractFromHeaders, setTraceContext } from '@nx-scraper/shared';

// Extend Express Request to include ID, Correlation ID, and Parent Request ID
declare global {
    namespace Express {
        interface Request {
            id?: string;
            correlationId?: string;
            parentRequestId?: string;
        }
    }
}

/**
 * Request ID Middleware with Distributed Tracing
 * Generates or accepts correlation IDs and sets up AsyncLocalStorage context
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    // Generate unique request ID
    req.id = (req.headers['x-request-id'] as string) || uuidv4();

    // Extract or generate correlation ID for distributed tracing
    const traceContext = extractFromHeaders(req.headers as Record<string, string | string[] | undefined>);
    req.correlationId = traceContext.correlationId || uuidv4();
    req.parentRequestId = traceContext.parentRequestId;

    // Set response headers
    res.setHeader('X-Request-ID', req.id);
    res.setHeader('X-Correlation-ID', req.correlationId);

    // Setup AsyncLocalStorage context for this request
    const store = new Map<string, any>();
    store.set('correlationId', req.correlationId);
    store.set('requestId', req.id);

    if (req.parentRequestId) {
        store.set('parentRequestId', req.parentRequestId);
    }

    // Add user context if authenticated
    if ((req as any).user?.id) {
        store.set('userId', (req as any).user.id);
    }

    if ((req as any).apiKey?.id) {
        store.set('apiKeyId', (req as any).apiKey.id);
    }

    // Run the rest of the request in this context
    contextStorage.run(store, () => next());
}
