import { Registry, collectDefaultMetrics } from 'prom-client';
import logger from '../utils/logger.js';

// Create a global registry for the entire application (Shared across Core and Plugins)
export const register = new Registry();

// Initialize default Node.js metrics
// Prevent multiple initializations
let initialized = false;

export function initMetrics(): void {
    if (initialized) return;

    collectDefaultMetrics({ register });
    logger.info('📊 Shared Metrics Registry initialized');
    initialized = true;
}

export async function getMetrics(): Promise<string> {
    return register.metrics();
}

import { Counter, Gauge, Histogram } from 'prom-client';

// ============================================
// Scraper Metrics
// ============================================

export const scrapesTotal = new Counter({
    name: 'scraper_jobs_total',
    help: 'Total number of scrape jobs executed',
    labelNames: ['scraper', 'status'], // scraper name, success/failure
    registers: [register],
});

export const scrapeErrorsTotal = new Counter({
    name: 'scraper_errors_total',
    help: 'Total number of scraper errors',
    labelNames: ['scraper', 'error_type'],
    registers: [register],
});

export const scrapeDurationSeconds = new Histogram({
    name: 'scraper_duration_seconds',
    help: 'Duration of scrape jobs in seconds',
    labelNames: ['scraper', 'status'],
    buckets: [1, 5, 10, 30, 60, 120, 300], // optimized buckets
    registers: [register],
});

export const activeScrapers = new Gauge({
    name: 'scraper_active_jobs',
    help: 'Number of currently running scraper jobs',
    labelNames: ['scraper'],
    registers: [register],
});

// ============================================
// Job Lifecycle & Queue Metrics
// ============================================

export const jobStateTransitions = new Counter({
    name: 'job_state_transitions_total',
    help: 'Total job state transitions',
    labelNames: ['from_state', 'to_state', 'job_type'],
    registers: [register],
});

export const jobRetries = new Counter({
    name: 'job_retries_total',
    help: 'Total job retry attempts',
    labelNames: ['job_type', 'scraper', 'error_category'],
    registers: [register],
});

export const jobSubmissionsTotal = new Counter({
    name: 'job_submissions_total',
    help: 'Total job submission attempts',
    labelNames: ['scraper', 'status'],
    registers: [register],
});

export const queueProcessingLag = new Gauge({
    name: 'queue_processing_lag_seconds',
    help: 'Time elapsed since oldest waiting job was added to queue',
    labelNames: ['queue'],
    registers: [register],
});

export const jobWaitTime = new Histogram({
    name: 'job_wait_time_seconds',
    help: 'Time job waited in queue before processing started',
    labelNames: ['queue', 'priority'],
    buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
    registers: [register],
});

// ============================================
// Error Classification Metrics
// ============================================

export const scrapeErrorsByCategory = new Counter({
    name: 'scrape_errors_by_category_total',
    help: 'Total scraper errors by category',
    labelNames: ['category', 'scraper', 'failure_point'],
    registers: [register],
});

export const errorSeverityTotal = new Counter({
    name: 'error_severity_total',
    help: 'Total errors by severity level',
    labelNames: ['severity', 'error_code'],
    registers: [register],
});

// ============================================
// Data Quality Metrics
// ============================================

export const dataExtractionSuccess = new Counter({
    name: 'data_extraction_results_total',
    help: 'Data extraction results by quality',
    labelNames: ['scraper', 'data_quality'], // empty, partial, complete
    registers: [register],
});

export const dataFieldsExtracted = new Histogram({
    name: 'data_fields_extracted',
    help: 'Number of fields successfully extracted',
    labelNames: ['scraper'],
    buckets: [0, 1, 5, 10, 20, 50, 100],
    registers: [register],
});
