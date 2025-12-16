import { browserPool } from '../browser/pool.js';
import logger from '../utils/logger.js';

export interface ScalingConfig {
    minBrowsers: number;
    maxBrowsers: number;
    scaleUpThreshold: number;  // Utilization % to trigger scale up
    scaleDownThreshold: number;  // Utilization % to trigger scale down
    cooldownMs: number;  // Time between scaling actions
}

export interface PoolStats {
    totalBrowsers: number;
    activePages: number;
    totalPagesCreated: number;
    maxBrowsers: number | undefined;
    browsers: Array<{
        id: string;
        engine: string;
        pages: number;
        totalCreated: number | undefined;
        ageSeconds: number;
        idleSeconds: number;
    }>;
}

export class BrowserPoolScaler {
    private config: ScalingConfig;
    private lastScaleAction: number = 0;
    private scalingInterval?: NodeJS.Timeout;

    constructor(config: Partial<ScalingConfig> = {}) {
        this.config = {
            minBrowsers: config.minBrowsers || 2,
            maxBrowsers: config.maxBrowsers || 20,
            scaleUpThreshold: config.scaleUpThreshold || 0.8,  // 80%
            scaleDownThreshold: config.scaleDownThreshold || 0.2,  // 20%
            cooldownMs: config.cooldownMs || 30000  // 30 seconds
        };
    }

    /**
     * Start auto-scaling monitoring
     */
    start(intervalMs: number = 10000): void {
        if (this.scalingInterval) {
            return;
        }

        logger.info('🚀 Browser pool auto-scaling started');

        this.scalingInterval = setInterval(() => {
            void this.evaluateScaling();
        }, intervalMs);
    }

    /**
     * Stop auto-scaling
     */
    stop(): void {
        if (this.scalingInterval) {
            clearInterval(this.scalingInterval);
            this.scalingInterval = undefined;
            logger.info('🛑 Browser pool auto-scaling stopped');
        }
    }

    /**
     * Evaluate if scaling is needed
     */
    private async evaluateScaling(): Promise<void> {
        const now = Date.now();

        if (now - this.lastScaleAction < this.config.cooldownMs) {
            return;
        }

        const stats = browserPool.getStats() as PoolStats;
        const utilization = this.calculateUtilization(stats);

        logger.debug(`Browser pool utilization: ${(utilization * 100).toFixed(1)}%`);

        if (utilization >= this.config.scaleUpThreshold) {
            await this.scaleUp(stats);
        } else if (utilization <= this.config.scaleDownThreshold) {
            await this.scaleDown(stats);
        }
    }

    private calculateUtilization(stats: PoolStats): number {
        if (!stats.maxBrowsers || stats.maxBrowsers === 0) return 0;

        const browserUtilization = stats.totalBrowsers / stats.maxBrowsers;
        const pageUtilization = stats.activePages / (stats.totalBrowsers * 5 || 1); // Assuming avg 5 pages per browser

        return (browserUtilization * 0.6) + (pageUtilization * 0.4);
    }

    private async scaleUp(stats: PoolStats): Promise<void> {
        if (stats.maxBrowsers && stats.totalBrowsers >= stats.maxBrowsers) {
            logger.warn(`Cannot scale up: Already at max browsers (${stats.maxBrowsers})`);
            return;
        }

        const increment = Math.max(2, Math.floor(stats.totalBrowsers * 0.5));
        const limit = stats.maxBrowsers || this.config.maxBrowsers;
        const newTotal = Math.min(stats.totalBrowsers + increment, limit);

        logger.info(`📈 Scaling UP browser pool: ${stats.totalBrowsers} → ${newTotal}`);
        this.lastScaleAction = Date.now();

        // Note: Actual scaling implementation requires calling browserPool to launch instances,
        // but current BrowserPool doesn't expose a 'launch' method publicly (it supports lazy acquire).
        // For now, we rely on 'acquirePage' to trigger launching, so this scaler is mostly predictive/logging
        // or would need to call a specific method on pool if it existed.
        // Assuming we might implement preemptive launching later.
    }

    private async scaleDown(stats: PoolStats): Promise<void> {
        if (stats.totalBrowsers <= this.config.minBrowsers) {
            return;
        }

        const idleBrowsers = stats.browsers.filter(b => b.pages === 0).length;

        if (idleBrowsers === 0) {
            return;
        }

        logger.info(`📉 Scaling DOWN browser pool (${idleBrowsers} idle browsers)`);
        this.lastScaleAction = Date.now();
        // BrowserPool handles idle cleanup automatically in startIdleCleanup()
        // So this method primarily acts as a coordinating signal or metric logger.
    }

    getStats() {
        const poolStats = browserPool.getStats();
        const utilization = this.calculateUtilization(poolStats);

        return {
            current: poolStats.totalBrowsers,
            min: this.config.minBrowsers,
            max: this.config.maxBrowsers,
            utilization: (utilization * 100).toFixed(1) + '%',
            shouldScaleUp: utilization >= this.config.scaleUpThreshold,
            shouldScaleDown: utilization <= this.config.scaleDownThreshold
        };
    }
}

export const browserPoolScaler = new BrowserPoolScaler();
