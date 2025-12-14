import { browserPool } from '../browser/pool.js';
import logger from '../utils/logger.js';

export interface ScalingConfig {
    minBrowsers: number;
    maxBrowsers: number;
    scaleUpThreshold: number;  // Utilization % to trigger scale up
    scaleDownThreshold: number;  // Utilization % to trigger scale down
    cooldownMs: number;  // Time between scaling actions
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
            this.evaluateScaling();
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

        const stats = browserPool.getStats();
        const utilization = this.calculateUtilization(stats);

        logger.debug(`Browser pool utilization: ${(utilization * 100).toFixed(1)}%`);

        if (utilization >= this.config.scaleUpThreshold) {
            await this.scaleUp(stats);
        } else if (utilization <= this.config.scaleDownThreshold) {
            await this.scaleDown(stats);
        }
    }

    private calculateUtilization(stats: any): number {
        if (stats.maxBrowsers === 0) return 0;

        const browserUtilization = stats.totalBrowsers / stats.maxBrowsers;
        const pageUtilization = stats.totalPages / (stats.totalBrowsers * 5 || 1);

        return (browserUtilization * 0.6) + (pageUtilization * 0.4);
    }

    private async scaleUp(stats: any): Promise<void> {
        if (stats.totalBrowsers >= this.config.maxBrowsers) {
            logger.warn(`Cannot scale up: Already at max browsers (${this.config.maxBrowsers})`);
            return;
        }

        const increment = Math.max(2, Math.floor(stats.totalBrowsers * 0.5));
        const newMax = Math.min(stats.totalBrowsers + increment, this.config.maxBrowsers);

        logger.info(`📈 Scaling UP browser pool: ${stats.totalBrowsers} → ${newMax}`);
        this.lastScaleAction = Date.now();
    }

    private async scaleDown(stats: any): Promise<void> {
        if (stats.totalBrowsers <= this.config.minBrowsers) {
            return;
        }

        const idleBrowsers = stats.browsers.filter((b: any) => b.pages === 0).length;

        if (idleBrowsers === 0) {
            return;
        }

        logger.info(`📉 Scaling DOWN browser pool (${idleBrowsers} idle browsers)`);
        this.lastScaleAction = Date.now();
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
