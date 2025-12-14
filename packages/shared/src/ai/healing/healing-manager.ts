import { dragonfly } from '../../database/dragonfly-client.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import { AISelector } from '../schemas/ai-outputs.schema.js';

export interface HealingSelector {
    id: string;
    domain: string;
    field: string;
    selector: AISelector;
    successCount: number;
    failCount: number;
    lastSuccess?: number;
    lastFailure?: number;
    score: number; // 0.0 to 1.0
    createdAt: number;
}

export class HealingManager {
    private readonly prefix = 'healing:';

    // Config
    private readonly MIN_SCORE_THRESHOLD = 0.4; // Selectors below this are ignored/deleted
    private readonly MAX_SELECTORS_PER_FIELD = 5; // Keep top 5 selectors

    /**
     * Save a generated selector for a domain/field
     */
    async saveSelector(domain: string, field: string, selector: AISelector): Promise<string> {
        try {
            const client = dragonfly.getClient();

            // Create a unique hash for the selector content to avoid duplicates
            const contentHash = crypto.createHash('sha256')
                .update(JSON.stringify(selector))
                .digest('hex');

            const id = `${domain}:${field}:${contentHash}`;
            const key = `${this.prefix}selector:${id}`;

            // Check if exists
            const existing = await client.get(key);
            if (existing) {
                return id; // Already exists
            }

            const healingSelector: HealingSelector = {
                id,
                domain,
                field,
                selector,
                successCount: 0,
                failCount: 0,
                score: 0.5, // Start with neutral score
                createdAt: Date.now()
            };

            // Save selector data
            await client.set(key, JSON.stringify(healingSelector));

            // Add to domain:field index (Sorted Set by score)
            await client.zadd(
                `${this.prefix}domain:${domain}:field:${field}`,
                healingSelector.score,
                id
            );

            logger.debug({ domain, field, id }, 'Saved new healing selector');
            return id;
        } catch (error) {
            logger.error({ error, domain, field }, 'Failed to save healing selector');
            throw error;
        }
    }

    /**
     * Get best selectors for a domain/field
     */
    async getSelectors(domain: string, field: string): Promise<HealingSelector[]> {
        try {
            const client = dragonfly.getClient();
            const indexKey = `${this.prefix}domain:${domain}:field:${field}`;

            // Get top selectors by score (descending)
            const ids = await client.zrevrange(indexKey, 0, this.MAX_SELECTORS_PER_FIELD - 1);

            if (!ids || ids.length === 0) return [];

            const selectors: HealingSelector[] = [];
            for (const id of ids) {
                const data = await client.get(`${this.prefix}selector:${id}`);
                if (data) {
                    const selector = JSON.parse(data) as HealingSelector;
                    // Only return viable selectors
                    if (selector.score >= this.MIN_SCORE_THRESHOLD) {
                        selectors.push(selector);
                    }
                }
            }

            return selectors;
        } catch (error) {
            logger.error({ error, domain, field }, 'Failed to get healing selectors');
            return [];
        }
    }

    /**
     * Report success/failure for a selector
     */
    async reportOutcome(selectorId: string, success: boolean): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const key = `${this.prefix}selector:${selectorId}`;

            const data = await client.get(key);
            if (!data) return;

            const selector = JSON.parse(data) as HealingSelector;

            if (success) {
                selector.successCount++;
                selector.lastSuccess = Date.now();
                // Boost score (asymptotic to 1.0)
                selector.score = Math.min(1.0, selector.score + 0.1);
            } else {
                selector.failCount++;
                selector.lastFailure = Date.now();
                // Penalize score (exponential decay)
                selector.score = Math.max(0.0, selector.score * 0.8);
            }

            // Update data
            await client.set(key, JSON.stringify(selector));

            // Update score in index
            const indexKey = `${this.prefix}domain:${selector.domain}:field:${selector.field}`;
            if (selector.score < this.MIN_SCORE_THRESHOLD) {
                // Remove if score drops too low
                await client.zrem(indexKey, selectorId);
                // Optional: Delete the key itself or keep for historical analysis
                // await client.del(key); 
                logger.info({ selectorId, score: selector.score }, 'Selector pruned due to low score');
            } else {
                await client.zadd(indexKey, selector.score, selectorId);
            }

        } catch (error) {
            logger.error({ error, selectorId }, 'Failed to report selector outcome');
        }
    }

    /**
     * Get stats for a domain
     */
    async getDomainStats(domain: string): Promise<any> {
        try {
            const client = dragonfly.getClient();
            // This is a bit expensive, scanning keys. In prod, maintain a separate stats counter.
            const keys = await client.keys(`${this.prefix}domain:${domain}:field:*`);
            return {
                trackedFields: keys.length,
                domain
            };
        } catch (error) {
            return {};
        }
    }
}

export const healingManager = new HealingManager();
