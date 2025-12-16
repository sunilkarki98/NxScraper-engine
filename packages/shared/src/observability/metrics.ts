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

export const scrapeErrorsTopal = new Counter({
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
