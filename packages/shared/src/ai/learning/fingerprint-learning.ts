import { dragonfly } from '../../database/dragonfly-client.js';
import { BrowserFingerprint } from '../../browser/fingerprint-generator.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Fingerprint Performance Metrics (Compressed for storage)
 */
export interface FingerprintMetrics {
    fingerprintHash: string;
    // fingerprint: BrowserFingerprint;  // ❌ Don't store full object (wasteful)
    domain: string;
    successCount: number;
    failureCount: number;
    blockCount: number;      // Explicit blocks (429, CAPTCHA)
    avgResponseTime: number;  // Average page load time
    lastUsed: number;
    createdAt: number;
}

/**
 * Extended metrics with fingerprint (for return values only)
 */
interface FingerprintMetricsWithFP extends FingerprintMetrics {
    fingerprint?: BrowserFingerprint;
}

/**
 * Fingerprint Learning System
 * Tracks which fingerprints work best for each domain using Bayesian optimization
 */
export class FingerprintLearning {
    private readonly keyPrefix = 'learn:fp:domain:';
    private readonly TIME_DECAY_DAYS = 7; // Older data weighs less

    /**
     * Get the best fingerprint for a domain based on learned success rates
     */
    async getBestFingerprint(domain: string): Promise<BrowserFingerprint | null> {
        try {
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            // Fetch all fingerprint metrics for this domain
            const allMetrics = await client.hgetall(key);

            if (!allMetrics || Object.keys(allMetrics).length === 0) {
                logger.debug({ domain }, 'No learned fingerprints for domain');
                return null;
            }

            let bestHash: string | null = null;
            let maxScore = -1;

            for (const [fpHash, json] of Object.entries(allMetrics)) {
                const metrics = JSON.parse(json) as FingerprintMetrics;
                const score = this.calculateScore(metrics);

                if (score > maxScore) {
                    maxScore = score;
                    bestHash = fpHash;
                }
            }

            if (bestHash && maxScore > 0.5) {
                // Reconstruct fingerprint from hash (stored separately)
                const fingerprint = await this.getFingerprintByHash(domain, bestHash);

                if (fingerprint) {
                    const metrics = JSON.parse(allMetrics[bestHash]) as FingerprintMetrics;
                    logger.info({
                        domain,
                        score: maxScore,
                        successRate: this.getSuccessRate(metrics)
                    }, 'Using learned fingerprint');
                    return fingerprint;
                }
            }

            return null;
        } catch (error) {
            logger.warn({ error, domain }, 'Failed to get learned fingerprint');
            return null;
        }
    }

    /**
     * Record successful login/scrape with this fingerprint
     */
    async recordSuccess(
        domain: string,
        fingerprint: BrowserFingerprint,
        responseTime?: number
    ): Promise<void> {
        try {
            const fpHash = this.hashFingerprint(fingerprint);
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            const existing = await client.hget(key, fpHash);
            let metrics: FingerprintMetrics;

            if (existing) {
                metrics = JSON.parse(existing);
                metrics.successCount++;
                metrics.lastUsed = Date.now();

                // Update rolling average response time
                if (responseTime) {
                    const total = metrics.avgResponseTime * (metrics.successCount - 1);
                    metrics.avgResponseTime = (total + responseTime) / metrics.successCount;
                }
            } else {
                metrics = {
                    fingerprintHash: fpHash,
                    // Don't store full fingerprint - save space
                    domain,
                    successCount: 1,
                    failureCount: 0,
                    blockCount: 0,
                    avgResponseTime: responseTime || 0,
                    lastUsed: Date.now(),
                    createdAt: Date.now()
                };

                // Store fingerprint separately for reconstruction
                await this.storeFingerprintMapping(domain, fpHash, fingerprint);
            }

            await client.hset(key, fpHash, JSON.stringify(metrics));
            logger.debug({ domain, fpHash: fpHash.substring(0, 8) }, 'Recorded fingerprint success');
        } catch (error) {
            logger.warn({ error }, 'Failed to record fingerprint success');
        }
    }

    /**
     * Record failure (generic failure, not necessarily blocked)
     */
    async recordFailure(domain: string, fingerprint: BrowserFingerprint): Promise<void> {
        try {
            const fpHash = this.hashFingerprint(fingerprint);
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            const existing = await client.hget(key, fpHash);

            if (existing) {
                const metrics = JSON.parse(existing) as FingerprintMetrics;
                metrics.failureCount++;
                metrics.lastUsed = Date.now();
                await client.hset(key, fpHash, JSON.stringify(metrics));
            } else {
                // Create new entry even for failure (to remember bad fingerprints)
                const metrics: FingerprintMetrics = {
                    fingerprintHash: fpHash,
                    domain,
                    successCount: 0,
                    failureCount: 1,
                    blockCount: 0,
                    avgResponseTime: 0,
                    lastUsed: Date.now(),
                    createdAt: Date.now()
                };
                await client.hset(key, fpHash, JSON.stringify(metrics));
                await this.storeFingerprintMapping(domain, fpHash, fingerprint);
            }

            logger.debug({ domain, fpHash: fpHash.substring(0, 8) }, 'Recorded fingerprint failure');
        } catch (error) {
            logger.warn({ error }, 'Failed to record fingerprint failure');
        }
    }

    /**
     * Record explicit block (429, CAPTCHA, rate limit)
     */
    async recordBlock(domain: string, fingerprint: BrowserFingerprint): Promise<void> {
        try {
            const fpHash = this.hashFingerprint(fingerprint);
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            const existing = await client.hget(key, fpHash);

            if (existing) {
                const metrics = JSON.parse(existing) as FingerprintMetrics;
                metrics.blockCount++;
                metrics.failureCount++;
                metrics.lastUsed = Date.now();
                await client.hset(key, fpHash, JSON.stringify(metrics));
            }

            logger.info({ domain, fpHash: fpHash.substring(0, 8) }, 'Fingerprint blocked - adjusting score');
        } catch (error) {
            logger.warn({ error }, 'Failed to record fingerprint block');
        }
    }

    /**
     * Get all fingerprints for a domain with their scores
     */
    async getDomainFingerprints(domain: string): Promise<Array<FingerprintMetrics & { score: number }>> {
        try {
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;
            const allMetrics = await client.hgetall(key);

            if (!allMetrics) return [];

            return Object.values(allMetrics)
                .map(json => JSON.parse(json) as FingerprintMetrics)
                .map(metrics => ({
                    ...metrics,
                    score: this.calculateScore(metrics)
                }))
                .sort((a, b) => b.score - a.score);
        } catch (error) {
            logger.warn({ error }, 'Failed to get domain fingerprints');
            return [];
        }
    }

    /**
     * Calculate fingerprint score using Bayesian success rate with time decay
     */
    private calculateScore(metrics: FingerprintMetrics): number {
        const total = metrics.successCount + metrics.failureCount;
        if (total === 0) return 0;

        // Bayesian average (add prior of 2 successes, 1 failure)
        const priorSuccess = 2;
        const priorFailure = 1;
        const bayesianRate =
            (metrics.successCount + priorSuccess) /
            (total + priorSuccess + priorFailure);

        // Block penalty (each block reduces score significantly)
        const blockPenalty = Math.max(0, 1 - (metrics.blockCount * 0.2));

        // Time decay (older data is less relevant)
        const daysSinceUsed = (Date.now() - metrics.lastUsed) / (1000 * 60 * 60 * 24);
        const timeDecay = Math.exp(-daysSinceUsed / this.TIME_DECAY_DAYS);

        // Confidence boost (more data = more confident)
        const confidenceBoost = Math.min(1, Math.log(total + 1) / 3);

        // Final score
        return bayesianRate * blockPenalty * timeDecay * (0.5 + 0.5 * confidenceBoost);
    }

    /**
     * Get simple success rate
     */
    private getSuccessRate(metrics: FingerprintMetrics): number {
        const total = metrics.successCount + metrics.failureCount;
        return total > 0 ? metrics.successCount / total : 0;
    }

    /**
     * Hash a fingerprint for storage
     */
    private hashFingerprint(fp: BrowserFingerprint): string {
        const key = `${fp.userAgent}|${fp.platform}|${fp.viewport.width}x${fp.viewport.height}`;
        return crypto.createHash('sha256').update(key).digest('hex');
    }

    /**
     * Store fingerprint mapping separately (for reconstruction)
     */
    private async storeFingerprintMapping(domain: string, fpHash: string, fingerprint: BrowserFingerprint): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const key = `learn:fp:map:${domain}`;
            await client.hset(key, fpHash, JSON.stringify(fingerprint));
            // Set TTL of 30 days
            await client.expire(key, 30 * 24 * 60 * 60);
        } catch (error) {
            logger.warn({ error }, 'Failed to store fingerprint mapping');
        }
    }

    /**
     * Get fingerprint by hash (reconstruct from mapping)
     */
    private async getFingerprintByHash(domain: string, fpHash: string): Promise<BrowserFingerprint | null> {
        try {
            const client = dragonfly.getClient();
            const key = `learn:fp:map:${domain}`;
            const data = await client.hget(key, fpHash);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.warn({ error }, 'Failed to get fingerprint by hash');
            return null;
        }
    }

    /**
     * Cleanup old fingerprint data (call periodically)
     */
    async cleanup(maxAgeDays: number = 30): Promise<number> {
        try {
            const client = dragonfly.getClient();
            const allKeys = await client.keys(`${this.keyPrefix}*`);
            let removedCount = 0;

            for (const key of allKeys) {
                const allMetrics = await client.hgetall(key);
                if (!allMetrics) continue;

                for (const [fpHash, json] of Object.entries(allMetrics)) {
                    const metrics = JSON.parse(json) as FingerprintMetrics;
                    const ageInDays = (Date.now() - metrics.lastUsed) / (1000 * 60 * 60 * 24);

                    if (ageInDays > maxAgeDays) {
                        await client.hdel(key, fpHash);
                        removedCount++;
                    }
                }
            }

            logger.info({ removedCount, maxAgeDays }, 'Cleaned up old fingerprint data');
            return removedCount;
        } catch (error) {
            logger.error({ error }, 'Failed to cleanup fingerprint data');
            return 0;
        }
    }
}

export const fingerprintLearning = new FingerprintLearning();
