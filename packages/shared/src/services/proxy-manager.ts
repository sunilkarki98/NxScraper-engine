import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { request, ProxyAgent } from 'undici';

export interface ProxyConfig {
    id: string;
    url: string; // http://user:pass@host:port
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

    /**
     * Add a new proxy
     */
    async addProxy(proxyUrl: string, metadata: Partial<ProxyConfig> = {}): Promise<ProxyConfig> {
        const id = crypto.randomUUID();
        const proxy: ProxyConfig = {
            id,
            url: proxyUrl,
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

        // Add to active set
        await client.sadd(`${this.keyPrefix}active`, id);

        logger.info({ proxyId: id, provider: proxy.provider }, 'Proxy added');
        return proxy;
    }

    /**
     * Get next healthy proxy (Round Robin)
     */
    async getNextProxy(): Promise<ProxyConfig | null> {
        const client = dragonfly.getClient();

        // Get all active proxies
        const activeIds = await client.smembers(`${this.keyPrefix}active`);

        if (activeIds.length === 0) {
            return null;
        }

        // Simple random selection for now (can be improved to true round-robin with a pointer)
        const randomId = activeIds[Math.floor(Math.random() * activeIds.length)];

        const data = await client.get(`${this.keyPrefix}id:${randomId}`);
        if (!data) return null;

        const proxy = JSON.parse(data) as ProxyConfig;

        // Update usage stats (async)
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

export const proxyManager = new ProxyManager();
