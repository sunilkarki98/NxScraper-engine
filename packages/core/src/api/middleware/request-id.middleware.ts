import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

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
 * Request ID Middleware
 * Generates or accepts correlation IDs for distributed tracing
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    // Use existing X-Request-ID if provided, otherwise generate new
    req.id = (req.headers['x-request-id'] as string) || uuidv4();

    // Set response header
    res.setHeader('X-Request-ID', req.id);

    next();
}
