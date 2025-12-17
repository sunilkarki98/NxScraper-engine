/**
 * Distributed Tracing Context Management
 * Provides correlation ID and trace context propagation across async boundaries
 */

import { contextStorage } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Trace Context Interface
 */
export interface TraceContext {
    correlationId: string;
    requestId?: string;
    parentRequestId?: string;
    userId?: string;
    jobId?: string;
    url?: string;
    scraper?: string;
    apiKeyId?: string;
    proxyId?: string;
    attemptNumber?: number;
    [key: string]: any;
}

/**
 * Set trace context in AsyncLocalStorage
 */
export function setTraceContext(correlationId: string, metadata?: Partial<TraceContext>): void {
    const store = contextStorage.getStore() || new Map<string, any>();

    store.set('correlationId', correlationId);

    if (metadata) {
        Object.entries(metadata).forEach(([key, value]) => {
            if (value !== undefined) {
                store.set(key, value);
            }
        });
    }
}

/**
 * Get current trace context from AsyncLocalStorage
 */
export function getTraceContext(): TraceContext | null {
    const store = contextStorage.getStore();
    if (!store) return null;

    const context: TraceContext = {
        correlationId: store.get('correlationId') || 'unknown'
    };

    // Optional fields
    const optionalFields = [
        'requestId', 'parentRequestId', 'userId', 'jobId',
        'url', 'scraper', 'apiKeyId', 'proxyId', 'attemptNumber'
    ];

    optionalFields.forEach(field => {
        const value = store.get(field);
        if (value !== undefined) {
            context[field] = value;
        }
    });

    return context;
}

/**
 * Execute a function with trace context
 */
export async function withTraceContext<T>(
    fn: () => Promise<T>,
    context: Partial<TraceContext>
): Promise<T> {
    const store = new Map<string, any>();

    // Generate correlation ID if not provided
    const correlationId = context.correlationId || uuidv4();
    store.set('correlationId', correlationId);

    // Set all context fields
    Object.entries(context).forEach(([key, value]) => {
        if (value !== undefined) {
            store.set(key, value);
        }
    });

    return contextStorage.run(store, fn);
}

/**
 * Propagate trace context to job data for queue submission
 */
export function propagateToJob(jobData: Record<string, any>): Record<string, any> {
    const context = getTraceContext();
    if (!context) return jobData;

    return {
        ...jobData,
        traceId: context.correlationId,
        metadata: {
            ...(jobData.metadata || {}),
            correlationId: context.correlationId,
            requestId: context.requestId,
            parentRequestId: jobData.id || context.requestId, // Chain tracing
            userId: context.userId,
            source: 'api'
        }
    };
}

/**
 * Extract trace context from job data in worker
 */
export function extractFromJob(jobData: Record<string, any>): Map<string, any> {
    const store = new Map<string, any>();

    // Extract from job
    const correlationId = jobData.metadata?.correlationId || jobData.traceId || jobData.id;
    store.set('correlationId', correlationId);

    if (jobData.metadata?.requestId) {
        store.set('requestId', jobData.metadata.requestId);
    }

    if (jobData.metadata?.parentRequestId) {
        store.set('parentRequestId', jobData.metadata.parentRequestId);
    }

    if (jobData.metadata?.userId) {
        store.set('userId', jobData.metadata.userId);
    }

    // Job-specific context
    if (jobData.id) {
        store.set('jobId', jobData.id);
    }

    if (jobData.url) {
        store.set('url', jobData.url);
    }

    if (jobData.scraperType) {
        store.set('scraper', jobData.scraperType);
    }

    return store;
}

/**
 * Generate trace headers for HTTP propagation
 */
export function getTraceHeaders(): Record<string, string> {
    const context = getTraceContext();
    if (!context) return {};

    const headers: Record<string, string> = {
        'x-correlation-id': context.correlationId
    };

    if (context.requestId) {
        headers['x-request-id'] = context.requestId;
    }

    if (context.parentRequestId) {
        headers['x-parent-request-id'] = context.parentRequestId;
    }

    return headers;
}

/**
 * Extract trace context from HTTP headers
 */
export function extractFromHeaders(headers: Record<string, string | string[] | undefined>): Partial<TraceContext> {
    const getString = (value: string | string[] | undefined): string | undefined => {
        if (Array.isArray(value)) return value[0];
        return value;
    };

    return {
        correlationId: getString(headers['x-correlation-id']) || uuidv4(),
        requestId: getString(headers['x-request-id']),
        parentRequestId: getString(headers['x-parent-request-id'])
    };
}

/**
 * Get or generate correlation ID
 */
export function getCorrelationId(): string {
    const store = contextStorage.getStore();
    if (store) {
        const id = store.get('correlationId');
        if (id) return id;
    }
    return uuidv4();
}

/**
 * Update trace context with additional metadata
 */
export function updateTraceContext(metadata: Partial<TraceContext>): void {
    const store = contextStorage.getStore();
    if (!store) return;

    Object.entries(metadata).forEach(([key, value]) => {
        if (value !== undefined) {
            store.set(key, value);
        }
    });
}
