import { Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { logger } from '@nx-scraper/shared';
import { register } from '@nx-scraper/shared/observability/metrics.js';

// Export register so other local modules can use it if needed (but prefer importing from shared)
export { register };

// ============================================
// Application Metrics
// ============================================

/**
 * HTTP request counter
 */
export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    registers: [register],
});

// ============================================
// Business Metrics
// ============================================

/**
 * Scrape success rate
 */
export const scrapeSuccessRate = new Gauge({
    name: 'scrape_success_rate',
    help: 'Percentage of successful scrapes',
    registers: [register],
});

/**
 * Total scrapes counter
 */
export const scrapesTotal = new Counter({
    name: 'scrapes_total',
    help: 'Total number of scrape jobs',
    labelNames: ['status', 'scraper_type'],
    registers: [register],
});

/**
 * Active scrape jobs
 */
export const activeScrapeJobs = new Gauge({
    name: 'active_scrape_jobs',
    help: 'Number of currently active scrape jobs',
    registers: [register],
});

/**
 * LLM API calls counter
 */
export const llmApiCalls = new Counter({
    name: 'llm_api_calls_total',
    help: 'Total LLM API calls',
    labelNames: ['provider', 'status'],
    registers: [register],
});

/**
 * LLM cost tracking
 */
export const llmCostTotal = new Counter({
    name: 'llm_cost_usd_total',
    help: 'Total LLM costs in USD',
    labelNames: ['provider'],
    registers: [register],
});

/**
 * Browser pool utilization
 */
export const browserPoolUtilization = new Gauge({
    name: 'browser_pool_utilization',
    help: 'Percentage of browser pool in use',
    registers: [register],
});

/**
 * Queue depth
 */
export const queueDepth = new Gauge({
    name: 'queue_depth',
    help: 'Number of jobs waiting in queue',
    labelNames: ['queue_name'],
    registers: [register],
});

// ============================================
// Error Metrics
// ============================================

/**
 * Application errors
 */
export const appErrors = new Counter({
    name: 'app_errors_total',
    help: 'Total application errors',
    labelNames: ['error_type', 'severity'],
    registers: [register],
});

/**
 * API key validation failures
 */
export const apiKeyValidationFailures = new Counter({
    name: 'api_key_validation_failures_total',
    help: 'Total API key validation failures',
    labelNames: ['reason'],
    registers: [register],
});

// ============================================
// Helper Functions
// ============================================

/**
 * Update scrape metrics
 */
export function recordScrapeMetrics(
    success: boolean,
    scraperType: string,
    durationMs: number
): void {
    scrapesTotal.inc({
        status: success ? 'success' : 'failure',
        scraper_type: scraperType,
    });

    // Update success rate (simplified calculation)
    const successCount = (scrapesTotal.get() as any).values.find(
        (v: any) => v.labels.status === 'success'
    )?.value || 0;

    const totalCount = (scrapesTotal.get() as any).values.reduce(
        (sum: number, v: any) => sum + v.value,
        0
    );

    if (totalCount > 0) {
        scrapeSuccessRate.set((successCount / totalCount) * 100);
    }
}

/**
 * Record LLM API call
 */
export function recordLLMCall(
    provider: string,
    success: boolean,
    costUsd?: number
): void {
    llmApiCalls.inc({
        provider,
        status: success ? 'success' : 'failure',
    });

    if (costUsd) {
        llmCostTotal.inc({ provider }, costUsd);
    }
}

/**
 * Update queue metrics
 */
export function updateQueueMetrics(queueName: string, depth: number): void {
    queueDepth.set({ queue_name: queueName }, depth);
}

/**
 * Record error
 */
export function recordError(errorType: string, severity: 'low' | 'medium' | 'high' | 'critical'): void {
    appErrors.inc({ error_type: errorType, severity });
}

/**
 * Initialize default metrics collection
 */
import { initMetrics as initSharedMetrics } from '@nx-scraper/shared/observability/metrics.js';

export function initMetrics(): void {
    // Collect default Node.js metrics via shared module
    initSharedMetrics();

    logger.info('Metrics collection initialized (via Shared Registry)');
}

/**
 * Get all metrics for Prometheus scraping
 */
export async function getMetrics(): Promise<string> {
    return register.metrics();
}
