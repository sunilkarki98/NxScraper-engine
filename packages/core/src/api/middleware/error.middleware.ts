import { Request, Response, NextFunction } from 'express';
import { isAppError, toAppError, logError } from '@nx-scraper/shared';
import { errorResponse } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

/**
 * Global error handler middleware
 * Must be registered last in middleware chain
 */
export function globalErrorHandler(
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    // Log the error with context
    logError(error, {
        requestId: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Convert to AppError for consistent handling
    const appError = toAppError(error);

    // Send error response
    res.status(appError.statusCode).json(errorResponse(
        appError.code,
        appError.message,
        appError.context
    ));
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
    logger.warn({
        requestId: req.id,
        method: req.method,
        path: req.path
    }, 'Route not found');

    res.status(404).json(errorResponse(
        'NOT_FOUND',
        `Route ${req.method} ${req.path} not found`
    ));
}
