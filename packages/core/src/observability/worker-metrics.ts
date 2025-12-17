/**
 * Worker-Specific Observability Metrics
 * Tracks worker health, job processing, and resource usage
 */

import { Gauge, Counter, Histogram } from 'prom-client';
import { register } from '@nx-scraper/shared';
import os from 'os';

/**
 * Worker ID - unique identifier for this worker instance
 */
export const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// ============================================
// Worker Health Metrics
// ============================================

export const workerHealthLastSeen = new Gauge({
    name: 'worker_health_last_seen_timestamp',
    help: 'Timestamp of last worker health check (Unix milliseconds)',
    labelNames: ['worker'],
    registers: [register],
});

export const workerMemoryUsage = new Gauge({
    name: 'worker_memory_bytes',
    help: 'Worker process memory usage in bytes',
    labelNames: ['worker', 'type'], // heap_used, heap_total, external, rss
    registers: [register],
});

export const workerCpuUsage = new Gauge({
    name: 'worker_cpu_usage_microseconds',
    help: 'Worker process CPU usage in microseconds',
    labelNames: ['worker', 'type'], // user, system
    registers: [register],
});

export const workerUptime = new Gauge({
    name: 'worker_uptime_seconds',
    help: 'Worker process uptime in seconds',
    labelNames: ['worker'],
    registers: [register],
});

// ============================================
// Job Processing Metrics
// ============================================

export const activeWorkerJobs = new Gauge({
    name: 'worker_active_jobs',
    help: 'Number of currently active jobs being processed by worker',
    labelNames: ['queue', 'worker'],
    registers: [register],
});

export const workerJobsProcessed = new Counter({
    name: 'worker_jobs_processed_total',
    help: 'Total jobs processed by worker',
    labelNames: ['queue', 'worker', 'status'],
    registers: [register],
});

export const workerJobDuration = new Histogram({
    name: 'worker_job_duration_seconds',
    help: 'Duration of job processing in worker',
    labelNames: ['queue', 'worker', 'status'],
    buckets: [1, 5, 10, 30, 60, 120, 300, 600],
    registers: [register],
});

// ============================================
// Error Metrics
// ============================================

export const workerErrorsTotal = new Counter({
    name: 'worker_errors_total',
    help: 'Total errors encountered by worker',
    labelNames: ['error_category', 'error_type', 'failure_point', 'scraper', 'worker'],
    registers: [register],
});

export const workerStalledJobs = new Counter({
    name: 'worker_stalled_jobs_total',
    help: 'Total number of stalled jobs detected',
    labelNames: ['queue', 'worker'],
    registers: [register],
});

export const workerFailedJobs = new Counter({
    name: 'worker_failed_jobs_total',
    help: 'Total number of permanently failed jobs',
    labelNames: ['queue', 'worker', 'error_category'],
    registers: [register],
});

// ============================================
// Worker Lifecycle Events
// ============================================

export const workerRestarts = new Counter({
    name: 'worker_restarts_total',
    help: 'Total number of worker restarts',
    labelNames: ['worker', 'reason'],
    registers: [register],
});

export const workerShutdowns = new Counter({
    name: 'worker_shutdowns_total',
    help: 'Total number of worker shutdowns',
    labelNames: ['worker', 'graceful'],
    registers: [register],
});

// ============================================
// Helper Functions
// ============================================

/**
 * Start worker health monitoring
 * Call this once when worker initializes
 */
export function startWorkerHealthMonitoring(workerId: string = WORKER_ID, intervalMs: number = 10000): NodeJS.Timeout {
    const interval = setInterval(() => {
        // Update last seen timestamp
        workerHealthLastSeen.set({ worker: workerId }, Date.now());

        // Update memory usage
        const mem = process.memoryUsage();
        workerMemoryUsage.set({ worker: workerId, type: 'heap_used' }, mem.heapUsed);
        workerMemoryUsage.set({ worker: workerId, type: 'heap_total' }, mem.heapTotal);
        workerMemoryUsage.set({ worker: workerId, type: 'external' }, mem.external);
        workerMemoryUsage.set({ worker: workerId, type: 'rss' }, mem.rss);

        // Update CPU usage
        const cpu = process.cpuUsage();
        workerCpuUsage.set({ worker: workerId, type: 'user' }, cpu.user);
        workerCpuUsage.set({ worker: workerId, type: 'system' }, cpu.system);

        // Update uptime
        workerUptime.set({ worker: workerId }, process.uptime());
    }, intervalMs);

    // Ensure interval is cleaned up on process exit
    process.on('beforeExit', () => clearInterval(interval));

    return interval;
}

/**
 * Record job processing start
 */
export function recordJobStart(queue: string, workerId: string = WORKER_ID): void {
    activeWorkerJobs.inc({ queue, worker: workerId });
}

/**
 * Record job processing completion
 */
export function recordJobComplete(
    queue: string,
    status: 'success' | 'failure',
    durationMs: number,
    workerId: string = WORKER_ID
): void {
    activeWorkerJobs.dec({ queue, worker: workerId });
    workerJobsProcessed.inc({ queue, worker: workerId, status });
    workerJobDuration.observe({ queue, worker: workerId, status }, durationMs / 1000);
}

/**
 * Record worker error
 */
export function recordWorkerError(
    errorCategory: string,
    errorType: string,
    failurePoint: string,
    scraper: string,
    workerId: string = WORKER_ID
): void {
    workerErrorsTotal.inc({
        error_category: errorCategory,
        error_type: errorType,
        failure_point: failurePoint,
        scraper: scraper,
        worker: workerId
    });
}

/**
 * Record stalled job
 */
export function recordStalledJob(queue: string, workerId: string = WORKER_ID): void {
    workerStalledJobs.inc({ queue, worker: workerId });
}

/**
 * Record failed job
 */
export function recordFailedJob(queue: string, errorCategory: string, workerId: string = WORKER_ID): void {
    workerFailedJobs.inc({ queue, worker: workerId, error_category: errorCategory });
}

/**
 * Get current worker health snapshot
 */
export function getWorkerHealthSnapshot(workerId: string = WORKER_ID) {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    return {
        workerId,
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: {
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal,
            external: mem.external,
            rss: mem.rss
        },
        cpu: {
            user: cpu.user,
            system: cpu.system
        },
        platform: {
            arch: os.arch(),
            platform: os.platform(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpus: os.cpus().length
        }
    };
}
