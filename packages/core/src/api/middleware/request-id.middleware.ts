import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include ID
declare global {
    namespace Express {
        interface Request {
            id?: string;
        }
    }
}

/**
 * Middleware to generate and track request IDs
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    // Use existing X-Request-ID if provided, otherwise generate new
    req.id = (req.headers['x-request-id'] as string) || uuidv4();

    // Set response header
    res.setHeader('X-Request-ID', req.id);

    next();
}
