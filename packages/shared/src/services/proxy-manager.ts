import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { request, ProxyAgent } from 'undici';

export type ProxyType = 'datacenter' | 'residential';

export interface ProxyConfig {
    id: string;
    url: string; // http://user:pass@host:port
    type: ProxyType;
    protocol: 'http' | 'https' | 'socks5';
    country?: string;
    provider?: string;
    isActive: boolean;
    usageCount: number;
    lastUsed: number;
    errorCount: number;
    lastError?: string;
    latency?: number;
}

export class ProxyManager {
    private readonly keyPrefix = 'proxy:';

    constructor() {
        this.initializeFromEnv();
    }

    private async initializeFromEnv() {
        if (process.env.PROXY_LIST) {
            const proxies = process.env.PROXY_LIST.split(',').map(p => p.trim()).filter(p => p);
            logger.info({ count: proxies.length }, 'Loading proxies from PROXY_LIST env...');

            for (const url of proxies) {
                // Determine type/protocol naively or default to http/datacenter
                const protocol = url.startsWith('socks') ? 'socks5' : 'http';
                // Add with fire-and-forget to avoid blocking constructor
                this.addProxy(url, { protocol, type: 'datacenter' }).catch(err =>
                    logger.error({ err }, 'Failed to load env proxy')
                );
            }
        }
    }

    /**
     * Add a new proxy
     */
    async addProxy(proxyUrl: string, metadata: Partial<ProxyConfig> = {}): Promise<ProxyConfig> {
        const id = crypto.randomUUID();
        const type = metadata.type || 'datacenter';

        const proxy: ProxyConfig = {
            id,
            url: proxyUrl,
            type,
            protocol: (metadata.protocol || 'http'),
            country: metadata.country,
            provider: metadata.provider,
            isActive: true,
            usageCount: 0,
            lastUsed: 0,
            errorCount: 0,
            ...metadata
        };

        const client = dragonfly.getClient();

        // Store proxy data
        await client.set(`${this.keyPrefix}id:${id}`, JSON.stringify(proxy));

        // Add to global set
        await client.sadd(`${this.keyPrefix}all`, id);

        // Add to pool-specific active set
        await client.sadd(`${this.keyPrefix}active:${type}`, id);
        // Maintain global active set for backward compatibility/stats if needed
        await client.sadd(`${this.keyPrefix}active`, id);

        logger.info({ proxyId: id, provider: proxy.provider, type }, 'Proxy added to pool');
        return proxy;
    }

    /**
     * Get next healthy proxy from specific pool (Round Robin / Random)
     */
    async getNextProxy(type: ProxyType = 'datacenter'): Promise<ProxyConfig | null> {
        const client = dragonfly.getClient();

        // Get from pool-specific active set
        const activeIds = await client.smembers(`${this.keyPrefix}active:${type}`);

        if (activeIds.length === 0) {
            // Strict Mode: Do NOT fall back to global 'active' set automatically.
            // This prevents accidental usage of expensive Residential proxies when Datacenter was requested.
            logger.warn({ type }, '⚠️ No active proxies found for requested type');
            return null;
        }

        // Random selection for O(1) load balancing
        const randomId = activeIds[Math.floor(Math.random() * activeIds.length)];
        return this.getProxyUnsafe(randomId);
    }

    private async getProxyUnsafe(id: string): Promise<ProxyConfig | null> {
        const client = dragonfly.getClient();
        const data = await client.get(`${this.keyPrefix}id:${id}`);
        if (!data) return null;

        const proxy = JSON.parse(data) as ProxyConfig;
        this.updateStats(proxy.id).catch(() => { });
        return proxy;
    }

    /**
     * Report proxy failure
     */
    async reportFailure(proxyId: string, error: string): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const data = await client.get(`${this.keyPrefix}id:${proxyId}`);

            if (data) {
                const proxy = JSON.parse(data) as ProxyConfig;
                proxy.errorCount++;
                proxy.lastError = error;

                // Blacklist if too many errors
                if (proxy.errorCount >= 5) {
                    proxy.isActive = false;
                    await client.srem(`${this.keyPrefix}active`, proxyId);
                    await client.srem(`${this.keyPrefix}active:${proxy.type}`, proxyId);
                    await client.sadd(`${this.keyPrefix}blacklisted`, proxyId);
                    logger.warn({ proxyId }, 'Proxy blacklisted due to excessive errors');
                }

                await client.set(`${this.keyPrefix}id:${proxyId}`, JSON.stringify(proxy));
            }
        } catch (err) {
            logger.error({ err }, 'Failed to report proxy failure');
        }
    }

    /**
     * Report proxy success
     */
    async reportSuccess(proxyId: string): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const data = await client.get(`${this.keyPrefix}id:${proxyId}`);

            if (data) {
                const proxy = JSON.parse(data) as ProxyConfig;
                if (proxy.errorCount > 0) {
                    proxy.errorCount = 0;
                    proxy.lastError = undefined;
                    await client.set(`${this.keyPrefix}id:${proxyId}`, JSON.stringify(proxy));
                }
            }
        } catch (err) {
            // Ignore
        }
    }

    /**
     * List all proxies
     */
    async listProxies(): Promise<ProxyConfig[]> {
        const client = dragonfly.getClient();
        const ids = await client.smembers(`${this.keyPrefix}all`);
        const proxies: ProxyConfig[] = [];

        for (const id of ids) {
            const data = await client.get(`${this.keyPrefix}id:${id}`);
            if (data) {
                proxies.push(JSON.parse(data));
            }
        }

        return proxies;
    }

    /**
     * Remove a proxy
     */
    async removeProxy(id: string): Promise<void> {
        const client = dragonfly.getClient();

        // Try to get type for precise cleanup
        const data = await client.get(`${this.keyPrefix}id:${id}`);
        if (data) {
            const proxy = JSON.parse(data) as ProxyConfig;
            await client.srem(`${this.keyPrefix}active:${proxy.type}`, id);
        } else {
            // Fallback cleanup if data missing
            await client.srem(`${this.keyPrefix}active:datacenter`, id);
            await client.srem(`${this.keyPrefix}active:residential`, id);
        }

        await client.del(`${this.keyPrefix}id:${id}`);
        await client.srem(`${this.keyPrefix}all`, id);
        await client.srem(`${this.keyPrefix}active`, id);
        await client.srem(`${this.keyPrefix}blacklisted`, id);
    }

    /**
     * Check proxy health (Real connectivity test)
     */
    async checkProxy(proxy: ProxyConfig): Promise<boolean> {
        try {
            const start = Date.now();

            // Create ProxyAgent for Undici
            const dispatcher = new ProxyAgent(proxy.url);

            const { statusCode } = await request('https://www.google.com/generate_204', {
                method: 'GET',
                dispatcher,
                headers: {
                    'User-Agent': 'NxScraper-Engine/2.0'
                }
            });

            if (statusCode !== 204) {
                throw new Error(`Unexpected status code: ${statusCode}`);
            }

            const latency = Date.now() - start;

            // Update latency if successful
            this.updateLatency(proxy.id, latency).catch(() => { });

            return true;
        } catch (error) {
            logger.debug({ proxyId: proxy.id, error: (error as any).message }, 'Proxy check failed');
            return false;
        }
    }

    private async updateLatency(id: string, latency: number) {
        try {
            const client = dragonfly.getClient();
            const data = await client.get(`${this.keyPrefix}id:${id}`);
            if (data) {
                const proxy = JSON.parse(data) as ProxyConfig;
                proxy.latency = latency;
                await client.set(`${this.keyPrefix}id:${id}`, JSON.stringify(proxy));
            }
        } catch (e) {
            // ignore
        }
    }

    async getBestProxyForUrl(url: string): Promise<string | undefined> {
        try {
            const domain = new URL(url).hostname;
            const client = dragonfly.getClient();

            // Check domain failure stats
            const statsKey = `${this.keyPrefix}stats:${domain}`;
            const stats = await client.hgetall(statsKey);

            const dcFail = parseInt(stats.dcFail || '0');
            const resFail = parseInt(stats.resFail || '0');
            const total = parseInt(stats.total || '0');

            let preferredType: ProxyType = 'datacenter';

            // 🧠 Adaptive Logic: If DC fails > 40% of time (and we have enough samples), switch to Residential
            if (total > 5 && (dcFail / total) > 0.4) {
                logger.info({ domain, failRate: (dcFail / total).toFixed(2) }, '🚫 High failure rate on DC IPs. Switching to Residential.');
                preferredType = 'residential';
            }

            const proxy = await this.getNextProxy(preferredType);
            return proxy ? proxy.url : undefined;

        } catch (error) {
            logger.error({ error }, 'Failed to get adaptive proxy');
            // Default to Datacenter, no magic fallback
            return await this.getNextProxy('datacenter').then(p => p?.url);
        }
    }

    async reportOutcome(proxyUrl: string, targetUrl: string, success: boolean): Promise<void> {
        if (!proxyUrl || !targetUrl) return;

        try {
            const domain = new URL(targetUrl).hostname;
            const client = dragonfly.getClient();
            const statsKey = `${this.keyPrefix}stats:${domain}`;

            // Find proxy type (naive check or lookup)
            const isResidential = proxyUrl.includes('res') || proxyUrl.includes('rot'); // naive
            // Better: lookup metadata if possible, but for speed we might infer or ignore

            await client.hincrby(statsKey, 'total', 1);
            if (!success) {
                if (isResidential) {
                    await client.hincrby(statsKey, 'resFail', 1);
                } else {
                    await client.hincrby(statsKey, 'dcFail', 1);
                }
            }

            // Expire stats after 24h to allow retry
            await client.expire(statsKey, 86400);

        } catch (e) {
            // ignore
        }
    }
    private async updateStats(id: string) {
        const client = dragonfly.getClient();
        const data = await client.get(`${this.keyPrefix}id:${id}`);
        if (data) {
            const proxy = JSON.parse(data) as ProxyConfig;
            proxy.usageCount++;
            proxy.lastUsed = Date.now();
            await client.set(`${this.keyPrefix}id:${id}`, JSON.stringify(proxy));
        }
    }
}

/**
 * Factory function to create ProxyManager instance
 */
export function createProxyManager(): ProxyManager {
    return new ProxyManager();
}

/**
 * @deprecated Use createProxyManager() or inject via DI container
 */
export const proxyManager = createProxyManager();
