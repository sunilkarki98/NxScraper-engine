import * as Sentry from "@sentry/node";
import { httpIntegration, expressIntegration } from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { logger } from '@nx-scraper/shared';

export interface SentryConfig {
    dsn: string;
    environment: string;
    release?: string;

    tracesSampleRate?: number;
    profilesSampleRate?: number;

    beforeSend?: (
        event: Sentry.ErrorEvent,
        hint: Sentry.EventHint
    ) => Sentry.ErrorEvent | null | Promise<Sentry.ErrorEvent | null>;
}

/**
 * Initialize Sentry (v8)
 */
export function initSentry(config: SentryConfig): void {
    if (!config.dsn) {
        logger.warn("Sentry DSN missing → Sentry disabled");
        return;
    }

    Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: config.release ?? process.env.npm_package_version,

        tracesSampleRate: config.tracesSampleRate ?? 0.3,
        profilesSampleRate: config.profilesSampleRate ?? 0.2,

        integrations: [
            // Automatically instrument HTTP requests
            httpIntegration(),
            // Automatically instrument Express
            expressIntegration(),
            Sentry.localVariablesIntegration(),
            nodeProfilingIntegration(),
        ],

        beforeSend: (event: Sentry.ErrorEvent, hint: Sentry.EventHint) => {
            if (event.request?.headers) {
                delete event.request.headers["authorization"];
                delete event.request.headers["cookie"];
            }

            if (config.beforeSend) {
                return config.beforeSend(event, hint);
            }

            return event;
        },
    });

    logger.info("Sentry v8 initialized with tracing & profiling");
}

/**
 * Capture exception
 */
export function captureException(
    error: Error,
    context?: Record<string, any>
): void {
    Sentry.captureException(error, { extra: context });
}

/**
 * Capture message
 */
export function captureMessage(
    message: string,
    level: Sentry.SeverityLevel = "info",
    context?: Record<string, any>
): void {
    Sentry.captureMessage(message, { level, extra: context });
}

/**
 * Set user context
 */
export function setUser(user: {
    id?: string;
    username?: string;
    email?: string;
    ip_address?: string;
}): void {
    Sentry.setUser(user);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(
    message: string,
    category?: string,
    data?: Record<string, any>
): void {
    Sentry.addBreadcrumb({
        message,
        category,
        data,
        level: "info",
        timestamp: Date.now() / 1000,
    });
}

/**
 * Start a span (Sentry v8 replacement for transactions)
 */
export function startTransaction(
    name: string,
    op: string
) {
    return Sentry.startInactiveSpan({
        name,
        op,
    });
}

/**
 * Wrap a function inside a span
 */
export function withTransaction<T>(
    name: string,
    op: string,
    fn: () => T
): T {
    return Sentry.startSpan(
        {
            name,
            op,
        },
        fn
    );
}

export { Sentry };
