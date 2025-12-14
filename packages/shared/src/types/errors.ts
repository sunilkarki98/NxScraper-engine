/**
 * Production-Grade Error Hierarchy for NxScraper-Engine
 * Comprehensive typed errors with retry logic, context, and proper classification
 */

/**
 * Base Application Error - All custom errors extend this
 */
export class ApplicationError extends Error {
    public readonly timestamp: Date;
    public readonly context?: Record<string, any>;

    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number,
        public readonly retryable: boolean = false,
        context?: Record<string, any>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.context = context;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            retryable: this.retryable,
            timestamp: this.timestamp.toISOString(),
            context: this.context
        };
    }
}

// ==========================================
// Client Errors (4xx - Not Retryable)
// ==========================================

export class ValidationError extends ApplicationError {
    constructor(message: string, public validationErrors?: Array<{ field: string; message: string }>, context?: Record<string, any>) {
        super(message, 'VALIDATION_ERROR', 400, false, { validationErrors, ...context });
    }
}

export class AuthenticationError extends ApplicationError {
    constructor(message: string = 'Authentication required', context?: Record<string, any>) {
        super(message, 'AUTHENTICATION_ERROR', 401, false, context);
    }
}

export class AuthorizationError extends ApplicationError {
    constructor(message: string = 'Insufficient permissions', context?: Record<string, any>) {
        super(message, 'AUTHORIZATION_ERROR', 403, false, context);
    }
}

export class NotFoundError extends ApplicationError {
    constructor(resource: string, identifier?: string, context?: Record<string, any>) {
        const message = identifier
            ? `${resource} not found: ${identifier}`
            : `${resource} not found`;
        super(message, 'NOT_FOUND', 404, false, { resource, identifier, ...context });
    }
}

export class ConflictError extends ApplicationError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'CONFLICT_ERROR', 409, false, context);
    }
}

export class RateLimitError extends ApplicationError {
    constructor(message: string = 'Rate limit exceeded', public readonly retryAfter?: number, context?: Record<string, any>) {
        super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter, ...context });
    }
}

// ==========================================
// Service Errors (5xx - Potentially Retryable)
// ==========================================

export class ServiceUnavailableError extends ApplicationError {
    constructor(service: string, context?: Record<string, any>) {
        super(`Service ${service} is unavailable`, 'SERVICE_UNAVAILABLE', 503, true, { service, ...context });
    }
}

export class NetworkError extends ApplicationError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'NETWORK_ERROR', 503, true, context);
    }
}

export class TimeoutError extends ApplicationError {
    constructor(operation: string, timeoutMs: number, context?: Record<string, any>) {
        super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT', 504, true, { operation, timeoutMs, ...context });
    }
}

export class DatabaseError extends ApplicationError {
    constructor(message: string, retryable: boolean = false, context?: Record<string, any>) {
        super(message, 'DATABASE_ERROR', 500, retryable, context);
    }
}

export class QueueError extends ApplicationError {
    constructor(message: string, retryable: boolean = true, context?: Record<string, any>) {
        super(message, 'QUEUE_ERROR', 500, retryable, context);
    }
}

export class ConfigurationError extends ApplicationError {
    constructor(message: string, context?: Record<string, any>) {
        super(message, 'CONFIGURATION_ERROR', 500, false, context);
    }
}

export class InternalServerError extends ApplicationError {
    constructor(message: string = 'Internal server error', context?: Record<string, any>) {
        super(message, 'INTERNAL_SERVER_ERROR', 500, false, context);
    }
}

// ==========================================
// Scraping-Specific Errors
// ==========================================

export class ScrapingError extends ApplicationError {
    constructor(message: string, public readonly url?: string, retryable: boolean = true, context?: Record<string, any>) {
        super(message, 'SCRAPING_ERROR', 500, retryable, { url, ...context });
    }
}

export class BotDetectionError extends ScrapingError {
    constructor(url: string, context?: Record<string, any>) {
        super(`Bot detected while scraping: ${url}`, url, true, { ...context, reason: 'bot_detection' });
    }
}

export class PageLoadError extends ScrapingError {
    constructor(url: string, statusCode?: number, context?: Record<string, any>) {
        super(
            `Failed to load page: ${url}${statusCode ? ` (HTTP ${statusCode})` : ''}`,
            url,
            statusCode ? statusCode >= 500 : true,
            { statusCode, ...context }
        );
    }
}

export class ScraperError extends ApplicationError {
    constructor(message: string, public scraper: string, public url: string, originalError?: Error, context?: Record<string, any>) {
        super(message, 'SCRAPER_ERROR', 500, true, { scraper, url, originalError: originalError?.message, ...context });
    }
}

// ==========================================
// AI/LLM Errors
// ==========================================

export class LLMError extends ApplicationError {
    constructor(message: string, public readonly provider?: string, retryable: boolean = true, context?: Record<string, any>) {
        super(message, 'LLM_ERROR', 500, retryable, { provider, ...context });
    }
}

export class LLMRateLimitError extends LLMError {
    constructor(provider: string, retryAfter?: number, context?: Record<string, any>) {
        super(`LLM provider ${provider} rate limit exceeded`, provider, true, { retryAfter, ...context });
    }
}

export class LLMQuotaExceededError extends LLMError {
    constructor(provider: string, context?: Record<string, any>) {
        super(`LLM provider ${provider} quota exceeded`, provider, false, context);
    }
}

export class ExternalServiceError extends ApplicationError {
    constructor(public service: string, message: string, retryable: boolean = true, originalError?: Error, context?: Record<string, any>) {
        super(message, 'EXTERNAL_SERVICE_ERROR', 502, retryable, { service, originalError: originalError?.message, ...context });
    }
}

// ==========================================
// Backward Compatibility Aliases
// ==========================================

export const AppError = ApplicationError;

// ==========================================
// Error Utilities
// ==========================================

export function isRetryableError(error: unknown): boolean {
    if (error instanceof ApplicationError) {
        return error.retryable;
    }
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        return message.includes('timeout') || message.includes('econnrefused') || message.includes('enotfound') || message.includes('network');
    }
    return false;
}

export function getHttpStatusCode(error: unknown): number {
    if (error instanceof ApplicationError) {
        return error.statusCode;
    }
    return 500;
}

export function toApplicationError(error: unknown): ApplicationError {
    if (error instanceof ApplicationError) {
        return error;
    }
    if (error instanceof Error) {
        return new InternalServerError(error.message, { originalError: error.name, stack: error.stack });
    }
    return new InternalServerError('Unknown error occurred', { error: String(error) });
}

export function isAppError(error: unknown): error is ApplicationError {
    return error instanceof ApplicationError;
}

export const toAppError = toApplicationError;

// ==========================================
// Error Logger
// ==========================================

import logger from '../utils/logger.js';

export function logError(error: unknown, context?: Record<string, any>): void {
    const appError = toApplicationError(error);
    const logData = {
        error: {
            name: appError.name,
            message: appError.message,
            code: appError.code,
            statusCode: appError.statusCode,
            retryable: appError.retryable,
            context: appError.context,
            stack: appError.stack
        },
        ...context
    };

    if (appError.statusCode >= 500) {
        logger.error(logData, 'Server error occurred');
    } else if (appError.statusCode >= 400) {
        logger.warn(logData, 'Client error occurred');
    } else {
        logger.info(logData, 'Error occurred');
    }
}
