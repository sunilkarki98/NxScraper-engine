import { container, Tokens } from '../di/container.js';
import logger from '../utils/logger.js';
import { env } from '../utils/env-validator.js';

export interface SystemStats {
    memory: {
        total: number;
        used: number;
        free: number;
        process: number;
    };
    uptime: number;
    loadAvg: number[];
}

export class SystemMonitor {
    private checkInterval: NodeJS.Timeout | null = null;
    private readonly MAX_MEMORY_MB = 1024; // 1GB limit for worker process

    /**
     * Start monitoring system resources
     */
    start(intervalMs = 30000) {
        if (this.checkInterval) return;

        logger.info('🏥 System Monitor started');
        this.checkInterval = setInterval(() => this.check(), intervalMs);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    /**
     * Perform health check
     */
    async check() {
        const memoryUsage = process.memoryUsage();
        const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const rssMB = Math.round(memoryUsage.rss / 1024 / 1024);

        // Log stats if usage is high
        if (rssMB > 500) {
            logger.info({
                rss: `${rssMB}MB`,
                heap: `${usedMB}MB`
            }, 'System Resource Usage');
        }

        // Hard Kill Safeguard
        // If this Node process (Worker) gets too fat, we should probably exit and let Docker/PM2 restart us.
        // This is the "Immortal" pattern: Death is part of the lifecycle.
        if (rssMB > this.MAX_MEMORY_MB) {
            logger.fatal({ rssMB, limit: this.MAX_MEMORY_MB }, '💀 Memory limit exceeded. Committing seppuku for system health.');

            // Allow logs to flush
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        }
    }

    getStats(): SystemStats {
        const mem = process.memoryUsage();
        return {
            memory: {
                total: mem.heapTotal,
                used: mem.heapUsed,
                free: 0, // Not applicable for Node process
                process: mem.rss
            },
            uptime: process.uptime(),
            loadAvg: [0, 0, 0] // Requires os module, keeping simple
        };
    }
}

export const systemMonitor = new SystemMonitor();
