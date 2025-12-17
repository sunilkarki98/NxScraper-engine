/**
 * Error Classification Utilities
 * Provides intelligent error classification, fingerprinting, and context enhancement
 */

import { ApplicationError, ErrorCategory, FailurePoint, isAppError, toApplicationError } from '../types/errors.js';
import logger from '../utils/logger.js';

/**
 * Error Classification Result
 */
export interface ErrorClassification {
    category: ErrorCategory;
    severity: 'low' | 'medium' | 'high' | 'critical';
    retryable: boolean;
    failurePoint: FailurePoint;
    fingerprint: string;
}

/**
 * Classify an error for metrics and alerting
 */
export function classifyError(error: unknown, defaultFailurePoint?: FailurePoint): ErrorClassification {
    const appError = toApplicationError(error);

    // Determine severity based on category and status code
    const severity = determineSeverity(appError);

    // Get failure point
    const failurePoint = appError.failurePoint !== FailurePoint.UNKNOWN
        ? appError.failurePoint
        : (defaultFailurePoint || FailurePoint.UNKNOWN);

    // Generate fingerprint for error grouping
    const fingerprint = getErrorFingerprint(appError);

    return {
        category: appError.category,
        severity,
        retryable: appError.retryable,
        failurePoint,
        fingerprint
    };
}

/**
 * Determine error severity
 */
function determineSeverity(error: ApplicationError): 'low' | 'medium' | 'high' | 'critical' {
    // Critical: Operational errors with high impact
    if (error.category === ErrorCategory.OPERATIONAL && error.statusCode >= 500) {
        return 'critical';
    }

    // High: Security issues or repeated failures
    if (error.category === ErrorCategory.SECURITY) {
        return 'high';
    }

    // High: Non-retryable operational errors
    if (error.category === ErrorCategory.OPERATIONAL && !error.retryable) {
        return 'high';
    }

    // Medium: Transient errors or retryable operational issues
    if (error.category === ErrorCategory.TRANSIENT || error.retryable) {
        return 'medium';
    }

    // Low: Client errors (validation, auth)
    if (error.category === ErrorCategory.PERMANENT && error.statusCode < 500) {
        return 'low';
    }

    return 'medium';
}

/**
 * Generate a unique error fingerprint for grouping similar errors
 */
export function getErrorFingerprint(error: unknown): string {
    if (isAppError(error)) {
        return error.getFingerprint();
    }

    if (error instanceof Error) {
        // For generic errors, use name and first line of stack
        const stackFirstLine = error.stack?.split('\n')[1]?.trim() || 'unknown';
        return `${error.name}:${stackFirstLine}`;
    }

    return 'unknown:unknown';
}

/**
 * Enhance error with additional context
 */
export function enhanceErrorContext(
    error: unknown,
    context: {
        url?: string;
        scraper?: string;
        jobId?: string;
        correlationId?: string;
        attemptNumber?: number;
        failurePoint?: FailurePoint;
        proxyId?: string;
        userId?: string;
    }
): ApplicationError {
    const appError = toApplicationError(error);

    // Merge context
    const enhancedContext = {
        ...appError.context,
        ...context
    };

    // Create new error with enhanced context
    const enhanced = new ApplicationError(
        appError.message,
        appError.code,
        appError.statusCode,
        appError.retryable,
        enhancedContext,
        appError.category,
        context.failurePoint || appError.failurePoint,
        context.attemptNumber || appError.attemptNumber
    );

    // Preserve original stack trace
    enhanced.stack = appError.stack;

    return enhanced;
}

/**
 * Check if an error should trigger an alert
 */
export function shouldAlert(error: ApplicationError, attemptNumber: number = 1): boolean {
    // Always alert on critical severity
    const classification = classifyError(error);
    if (classification.severity === 'critical') {
        return true;
    }

    // Alert on high severity after multiple attempts
    if (classification.severity === 'high' && attemptNumber >= 2) {
        return true;
    }

    // Alert on security issues
    if (error.category === ErrorCategory.SECURITY) {
        return true;
    }

    // Alert on non-retryable operational errors
    if (error.category === ErrorCategory.OPERATIONAL && !error.retryable) {
        return true;
    }

    return false;
}

/**
 * Determine if error is caused by external factors (not our code)
 */
export function isExternalError(error: ApplicationError): boolean {
    const externalFailurePoints = [
        FailurePoint.PAGE_NAVIGATION,
        FailurePoint.BROWSER_ACQUISITION,
        FailurePoint.PROXY_SELECTION
    ];

    return (
        error.category === ErrorCategory.TRANSIENT ||
        error.category === ErrorCategory.SECURITY ||
        externalFailurePoints.includes(error.failurePoint)
    );
}

/**
 * Get retry strategy based on error type
 */
export function getRetryStrategy(error: ApplicationError): {
    shouldRetry: boolean;
    delayMs: number;
    maxAttempts: number;
} {
    const classification = classifyError(error);

    // Never retry permanent errors
    if (!error.retryable || error.category === ErrorCategory.PERMANENT) {
        return { shouldRetry: false, delayMs: 0, maxAttempts: 0 };
    }

    // Security errors: longer delay, fewer attempts
    if (error.category === ErrorCategory.SECURITY) {
        return { shouldRetry: true, delayMs: 30000, maxAttempts: 2 };
    }

    // Transient errors: exponential backoff
    if (error.category === ErrorCategory.TRANSIENT) {
        return { shouldRetry: true, delayMs: 2000, maxAttempts: 5 };
    }

    // Operational errors: moderate retry
    if (error.category === ErrorCategory.OPERATIONAL) {
        return { shouldRetry: true, delayMs: 5000, maxAttempts: 3 };
    }

    return { shouldRetry: true, delayMs: 2000, maxAttempts: 3 };
}

/**
 * Log error with proper classification
 */
export function logClassifiedError(
    error: unknown,
    additionalContext?: Record<string, any>
): void {
    const appError = toApplicationError(error);
    const classification = classifyError(appError);

    const logPayload = {
        error: appError.toJSON(),
        classification,
        ...additionalContext
    };

    // Log at appropriate level
    if (classification.severity === 'critical') {
        logger.error(logPayload, `🚨 Critical error: ${appError.message}`);
    } else if (classification.severity === 'high') {
        logger.error(logPayload, `❌ High severity error: ${appError.message}`);
    } else if (classification.severity === 'medium') {
        logger.warn(logPayload, `⚠️ Warning: ${appError.message}`);
    } else {
        logger.info(logPayload, `ℹ️ ${appError.message}`);
    }
}
