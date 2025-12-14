import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { contextStorage } from '@nx-scraper/shared';

export const requestTracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();

    // Set response header
    res.setHeader('X-Request-Id', requestId);

    // Initialize context
    const store = new Map<string, any>();
    store.set('requestId', requestId);
    store.set('method', req.method);
    store.set('url', req.url);

    // Run next() within the context
    contextStorage.run(store, () => {
        next();
    });
};
