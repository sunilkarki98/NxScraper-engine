import { container, Tokens } from '../di/container.js';
import logger from '../utils/logger.js';

export interface DomainStats {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    lastUpdated: number;
}

export class RouterStatsService {
    private readonly PREFIX = 'router:stats';
    private readonly GLOBAL_PREFIX = 'router:global';
    private readonly WINDOW_SECONDS = 3600; // 1 hour stats window

    private get redis() {
        return container.resolve(Tokens.Dragonfly).getClient();
    }

    /**
     * Record a scrape result
     */
    async recordResult(domain: string, scraper: string, success: boolean): Promise<void> {
        const pipeline = this.redis.pipeline();
        const timestamp = Date.now();

        // 1. Domain-specific stats
        const domainKey = `${this.PREFIX}:${domain}:${scraper}`;
        pipeline.hincrby(domainKey, 'total', 1);
        pipeline.hincrby(domainKey, success ? 'success' : 'failure', 1);
        pipeline.hset(domainKey, 'last_updated', timestamp);
        pipeline.expire(domainKey, this.WINDOW_SECONDS * 24); // Keep for 24 hours

        // 2. Global scraper stats
        const globalKey = `${this.GLOBAL_PREFIX}:${scraper}`;
        pipeline.hincrby(globalKey, 'total', 1);
        pipeline.hincrby(globalKey, success ? 'success' : 'failure', 1);
        pipeline.hset(globalKey, 'last_updated', timestamp);

        await pipeline.exec();
    }

    /**
     * Get stats for a domain and scraper
     */
    async getDomainStats(domain: string, scraper: string): Promise<DomainStats | null> {
        const key = `${this.PREFIX}:${domain}:${scraper}`;
        const data = await this.redis.hgetall(key);

        if (!data || Object.keys(data).length === 0) {
            return null;
        }

        const total = parseInt(data.total || '0', 10);
        const success = parseInt(data.success || '0', 10);
        const failure = parseInt(data.failure || '0', 10);

        return {
            totalRequests: total,
            successCount: success,
            failureCount: failure,
            successRate: total > 0 ? (success / total) : 0,
            lastUpdated: parseInt(data.last_updated || '0', 10)
        };
    }

    /**
     * Check if a scraper is underperforming on a specific domain
     * Returns true if success rate is below threshold (default 70%)
     * Minimum 5 requests required to be significant
     */
    async isUnderperforming(domain: string, scraper: string, threshold = 0.7, minRequests = 5): Promise<boolean> {
        const stats = await this.getDomainStats(domain, scraper);

        if (!stats || stats.totalRequests < minRequests) {
            return false; // Not enough data
        }

        const isBad = stats.successRate < threshold;

        if (isBad) {
            logger.debug(
                { domain, scraper, successRate: stats.successRate, threshold },
                '📉 Scraper underperformance detected'
            );
        }

        return isBad;
    }
}
