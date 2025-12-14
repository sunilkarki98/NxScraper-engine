import { dragonfly } from '../../database/dragonfly-client.js';
import logger from '../../utils/logger.js';

export interface NavigationPath {
    domain: string;
    sourceUrl: string;
    targetUrl: string;
    action: 'click' | 'submit' | 'navigate';
    selector?: string;
    successCount: number;
    failCount: number;
    lastUsed: number;
}

export class AdaptiveNavigation {
    private readonly keyPrefix = 'learn:nav:domain:';

    /**
     * Record a successful navigation action
     */
    async recordSuccess(domain: string, sourceUrl: string, targetUrl: string, action: 'click' | 'submit' | 'navigate', selector?: string): Promise<void> {
        try {
            const pathId = this.generatePathId(sourceUrl, targetUrl, selector);
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            const data = await client.hget(key, pathId);
            let path: NavigationPath;

            if (data) {
                path = JSON.parse(data);
                path.successCount++;
                path.lastUsed = Date.now();
            } else {
                path = {
                    domain,
                    sourceUrl,
                    targetUrl,
                    action,
                    selector,
                    successCount: 1,
                    failCount: 0,
                    lastUsed: Date.now()
                };
            }

            await client.hset(key, pathId, JSON.stringify(path));

            logger.debug({ domain, action, selector }, 'Recorded successful navigation path');
        } catch (error) {
            logger.warn({ error }, 'Failed to record navigation success');
        }
    }

    /**
     * Record a failed navigation action
     */
    async recordFailure(domain: string, sourceUrl: string, targetUrl: string, selector?: string): Promise<void> {
        try {
            const pathId = this.generatePathId(sourceUrl, targetUrl, selector);
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            const data = await client.hget(key, pathId);
            if (data) {
                const path = JSON.parse(data) as NavigationPath;
                path.failCount++;
                path.lastUsed = Date.now();
                await client.hset(key, pathId, JSON.stringify(path));
            }
        } catch (error) {
            logger.warn({ error }, 'Failed to record navigation failure');
        }
    }

    /**
     * Get suggested path for a URL
     */
    async getSuggestedPath(domain: string, currentUrl: string): Promise<NavigationPath | null> {
        try {
            const client = dragonfly.getClient();
            const key = `${this.keyPrefix}${domain}`;

            // Fetch all paths for this domain in one O(1) call
            const allPaths = await client.hgetall(key);

            let bestPath: NavigationPath | null = null;
            let maxScore = -1;

            for (const json of Object.values(allPaths)) {
                const path = JSON.parse(json) as NavigationPath;

                // Check if this path starts from current URL (fuzzy match)
                if (this.urlsMatch(path.sourceUrl, currentUrl)) {
                    const score = this.calculateScore(path);
                    if (score > maxScore) {
                        maxScore = score;
                        bestPath = path;
                    }
                }
            }

            return bestPath;
        } catch (error) {
            logger.warn({ error }, 'Failed to get suggested path');
            return null;
        }
    }

    private generatePathId(source: string, target: string, selector?: string): string {
        // Simple hash or encoding
        return Buffer.from(`${source}|${target}|${selector || ''}`).toString('base64');
    }

    private urlsMatch(url1: string, url2: string): boolean {
        // Simple match, can be improved to ignore query params etc.
        return url1 === url2 || url1.includes(url2) || url2.includes(url1);
    }

    private calculateScore(path: NavigationPath): number {
        const total = path.successCount + path.failCount;
        if (total === 0) return 0;
        const rate = path.successCount / total;
        // Boost by usage count (confidence)
        return rate * Math.log(total + 1);
    }
}

export const adaptiveNavigation = new AdaptiveNavigation();
