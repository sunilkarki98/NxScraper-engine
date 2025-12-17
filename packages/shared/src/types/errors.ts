/**
 * Production-Grade Error Hierarchy for NxScraper-Engine
 * Comprehensive typed errors with retry logic, context, and proper classification
 */

/**
 * Error Category - High-level classification for errors
 */
export enum ErrorCategory {
    TRANSIENT = 'transient',        // Retry likely helps (network, timeout)
    PERMANENT = 'permanent',        // Retry won't help (validation, auth)
    OPERATIONAL = 'operational',    // System issue (queue, database)
    SECURITY = 'security'           // Security-related (bot detection, rate limit)
}

/**
 * Failure Point - Where in the pipeline the error occurred
 */
export enum FailurePoint {
    API_VALIDATION = 'api_validation',
    API_AUTHENTICATION = 'api_authentication',
    QUEUE_SUBMISSION = 'queue_submission',
    WORKER_INIT = 'worker_init',
    RATE_LIMIT_CHECK = 'rate_limit_check',
    PROXY_SELECTION = 'proxy_selection',
    BROWSER_ACQUISITION = 'browser_acquisition',
    PAGE_NAVIGATION = 'page_navigation',
    EVASION_APPLICATION = 'evasion_application',
    ACTION_EXECUTION = 'action_execution',
    SCRAPER_PARSE = 'scraper_parse',
    DATA_EXTRACTION = 'data_extraction',
    AI_PROCESSING = 'ai_processing',
    RESULT_VALIDATION = 'result_validation',
    WEBHOOK_DISPATCH = 'webhook_dispatch',
    CACHE_OPERATION = 'cache_operation',
    UNKNOWN = 'unknown'
}

/**
 * Base Application Error - All custom errors extend this
 */
export class ApplicationError extends Error {
    public readonly timestamp: Date;
    public readonly context?: Record<string, any>;
    public readonly category: ErrorCategory;
    public readonly failurePoint: FailurePoint;
    public readonly attemptNumber?: number;

    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode: number,
        public readonly retryable: boolean = false,
        context?: Record<string, any>,
        category?: ErrorCategory,
        failurePoint?: FailurePoint,
        attemptNumber?: number
    ) {
        super(message);
        this.name = this.constructor.name;
        this.timestamp = new Date();
        this.context = context;
        this.attemptNumber = attemptNumber;

        // Auto-classify if not provided
        this.category = category || this.autoClassifyCategory();
        this.failurePoint = failurePoint || FailurePoint.UNKNOWN;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Auto-classify error category based on error type
     */
    private autoClassifyCategory(): ErrorCategory {
        if (this.retryable) {
            if (this.statusCode >= 500) return ErrorCategory.OPERATIONAL;
            if (this.statusCode === 429) return ErrorCategory.SECURITY;
            return ErrorCategory.TRANSIENT;
        }
        if (this.statusCode >= 400 && this.statusCode < 500) {
            return ErrorCategory.PERMANENT;
        }
        return ErrorCategory.OPERATIONAL;
    }

    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            retryable: this.retryable,
            category: this.category,
            failurePoint: this.failurePoint,
            attemptNumber: this.attemptNumber,
            timestamp: this.timestamp.toISOString(),
            context: this.context,
            stack: this.stack
        };
    }

    /**
     * Get a unique fingerprint for error grouping
     */
    getFingerprint(): string {
        return `${this.code}:${this.failurePoint}:${this.statusCode}`;
    }
}

// ==========================================
// Client Errors (4xx - Not Retryable)
// ==========================================

export class ValidationError extends ApplicationError {
    constructor(message: string, public validationErrors?: Array<{ field: string; message: string }>, context?: Record<string, any>) {
        super(
            message,
            'VALIDATION_ERROR',
            400,
            false,
            { validationErrors, ...context },
            ErrorCategory.PERMANENT,
            FailurePoint.API_VALIDATION
        );
    }
}

export class AuthenticationError extends ApplicationError {
    constructor(message: string = 'Authentication required', context?: Record<string, any>) {
        super(
            message,
            'AUTHENTICATION_ERROR',
            401,
            false,
            context,
            ErrorCategory.PERMANENT,
            FailurePoint.API_AUTHENTICATION
        );
    }
}

export class AuthorizationError extends ApplicationError {
    constructor(message: string = 'Insufficient permissions', context?: Record<string, any>) {
        super(
            message,
            'AUTHORIZATION_ERROR',
            403,
            false,
            context,
            ErrorCategory.PERMANENT,
            FailurePoint.API_AUTHENTICATION
        );
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
    constructor(message: string = 'Rate limit exceeded', public readonly retryAfter?: number, context?: Record<string, any>, failurePoint?: FailurePoint) {
        super(
            message,
            'RATE_LIMIT_EXCEEDED',
            429,
            true,
            { retryAfter, ...context },
            ErrorCategory.SECURITY,
            failurePoint || FailurePoint.RATE_LIMIT_CHECK
        );
    }
}

// ==========================================
// Service Errors (5xx - Potentially Retryable)
// ==========================================

export class ServiceUnavailableError extends ApplicationError {
    constructor(service: string, context?: Record<string, any>) {
        super(
            `Service ${service} is unavailable`,
            'SERVICE_UNAVAILABLE',
            503,
            true,
            { service, ...context },
            ErrorCategory.OPERATIONAL
        );
    }
}

export class NetworkError extends ApplicationError {
    constructor(message: string, context?: Record<string, any>, failurePoint?: FailurePoint) {
        super(
            message,
            'NETWORK_ERROR',
            503,
            true,
            context,
            ErrorCategory.TRANSIENT,
            failurePoint || FailurePoint.PAGE_NAVIGATION
        );
    }
}

export class TimeoutError extends ApplicationError {
    constructor(operation: string, timeoutMs: number, context?: Record<string, any>, failurePoint?: FailurePoint) {
        super(
            `Operation '${operation}' timed out after ${timeoutMs}ms`,
            'TIMEOUT',
            504,
            true,
            { operation, timeoutMs, ...context },
            ErrorCategory.TRANSIENT,
            failurePoint || FailurePoint.PAGE_NAVIGATION
        );
    }
}

export class DatabaseError extends ApplicationError {
    constructor(message: string, retryable: boolean = false, context?: Record<string, any>) {
        super(
            message,
            'DATABASE_ERROR',
            500,
            retryable,
            context,
            ErrorCategory.OPERATIONAL,
            FailurePoint.CACHE_OPERATION
        );
    }
}

export class QueueError extends ApplicationError {
    constructor(message: string, retryable: boolean = true, context?: Record<string, any>) {
        super(
            message,
            'QUEUE_ERROR',
            500,
            retryable,
            context,
            ErrorCategory.OPERATIONAL,
            FailurePoint.QUEUE_SUBMISSION
        );
    }
}

export class ConfigurationError extends ApplicationError {
    constructor(message: string, context?: Record<string, any>) {
        super(
            message,
            'CONFIGURATION_ERROR',
            500,
            false,
            context,
            ErrorCategory.PERMANENT
        );
    }
}

export class InternalServerError extends ApplicationError {
    constructor(message: string = 'Internal server error', context?: Record<string, any>) {
        super(
            message,
            'INTERNAL_SERVER_ERROR',
            500,
            false,
            context,
            ErrorCategory.OPERATIONAL
        );
    }
}

// ==========================================
// Scraping-Specific Errors
// ==========================================

export class ScrapingError extends ApplicationError {
    constructor(
        message: string,
        public readonly url?: string,
        retryable: boolean = true,
        context?: Record<string, any>,
        failurePoint?: FailurePoint
    ) {
        super(
            message,
            'SCRAPING_ERROR',
            500,
            retryable,
            { url, ...context },
            retryable ? ErrorCategory.TRANSIENT : ErrorCategory.PERMANENT,
            failurePoint || FailurePoint.SCRAPER_PARSE
        );
    }
}

export class BotDetectionError extends ScrapingError {
    constructor(url: string, context?: Record<string, any>) {
        // Call parent with explicit category override
        super(
            `Bot detected while scraping: ${url}`,
            url,
            true,
            { ...context, reason: 'bot_detection' },
            FailurePoint.PAGE_NAVIGATION
        );
        // Override category through Object.defineProperty since it's readonly
        Object.defineProperty(this, 'category', {
            value: ErrorCategory.SECURITY,
            writable: false,
            enumerable: true,
            configurable: false
        });
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
    constructor(
        message: string,
        public scraper: string,
        public url: string,
        originalError?: Error,
        context?: Record<string, any>,
        failurePoint?: FailurePoint
    ) {
        super(
            message,
            'SCRAPER_ERROR',
            500,
            true,
            { scraper, url, originalError: originalError?.message, originalStack: originalError?.stack, ...context },
            ErrorCategory.TRANSIENT,
            failurePoint || FailurePoint.SCRAPER_PARSE
        );
    }
}

// ==========================================
// AI/LLM Errors
// ==========================================

export class LLMError extends ApplicationError {
    constructor(
        message: string,
        public readonly provider?: string,
        retryable: boolean = true,
        context?: Record<string, any>,
        failurePoint?: FailurePoint
    ) {
        super(
            message,
            'LLM_ERROR',
            500,
            retryable,
            { provider, ...context },
            retryable ? ErrorCategory.TRANSIENT : ErrorCategory.OPERATIONAL,
            failurePoint || FailurePoint.AI_PROCESSING
        );
    }
}

export class LLMRateLimitError extends LLMError {
    constructor(provider: string, retryAfter?: number, context?: Record<string, any>) {
        super(
            `LLM provider ${provider} rate limit exceeded`,
            provider,
            true,
            { retryAfter, ...context },
            FailurePoint.AI_PROCESSING
        );
        Object.defineProperty(this, 'category', {
            value: ErrorCategory.SECURITY,
            writable: false,
            enumerable: true,
            configurable: false
        });
    }
}

export class LLMQuotaExceededError extends LLMError {
    constructor(provider: string, context?: Record<string, any>) {
        super(`LLM provider ${provider} quota exceeded`, provider, false, context);
    }
}

export class ExternalServiceError extends ApplicationError {
    constructor(
        public service: string,
        message: string,
        retryable: boolean = true,
        originalError?: Error,
        context?: Record<string, any>,
        failurePoint?: FailurePoint
    ) {
        super(
            message,
            'EXTERNAL_SERVICE_ERROR',
            502,
            retryable,
            { service, originalError: originalError?.message, ...context },
            retryable ? ErrorCategory.TRANSIENT : ErrorCategory.OPERATIONAL,
            failurePoint
        );
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
