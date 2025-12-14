import logger from '../utils/logger.js';

interface ProxyStatus {
    url: string;
    failures: number;
    successes: number;
    lastUsed: number;
    disabledUntil: number;
    responseTime: number;
    lastHealthCheck: number;
}

type RotationStrategy = 'random' | 'round-robin' | 'least-used' | 'fastest';

export class ProxyService {
    private proxies: ProxyStatus[] = [];
    private rotationStrategy: RotationStrategy = 'random';
    private currentIndex: number = 0;

    constructor(proxyList?: string, strategy?: RotationStrategy) {
        const proxies = proxyList || process.env.PROXY_LIST || '';
        this.rotationStrategy = strategy || (process.env.PROXY_ROTATION_STRATEGY as RotationStrategy) || 'random';

        if (!proxies) {
            logger.warn('No proxies configured. Running without proxy rotation.');
            return;
        }

        this.proxies = proxies.split(',').map((url) => ({
            url: url.trim(),
            failures: 0,
            successes: 0,
            lastUsed: 0,
            disabledUntil: 0,
            responseTime: 0,
            lastHealthCheck: 0,
        })).filter(p => p.url.length > 0);

        logger.info(`Loaded ${this.proxies.length} proxies with ${this.rotationStrategy} rotation`);
    }

    async getNext(): Promise<string | undefined> {
        const now = Date.now();
        const activeProxies = this.proxies.filter(p => p.disabledUntil < now);

        if (activeProxies.length === 0) {
            if (this.proxies.length > 0) {
                logger.warn('All proxies disabled. Using soonest recovery.');
                return this.proxies.sort((a, b) => a.disabledUntil - b.disabledUntil)[0].url;
            }
            return undefined;
        }

        let proxy: ProxyStatus;

        switch (this.rotationStrategy) {
            case 'round-robin':
                proxy = activeProxies[this.currentIndex % activeProxies.length];
                this.currentIndex++;
                break;
            case 'least-used':
                proxy = activeProxies.sort((a, b) => a.lastUsed - b.lastUsed)[0];
                break;
            case 'fastest':
                proxy = activeProxies.sort((a, b) => (a.responseTime || 9999) - (b.responseTime || 9999))[0];
                break;
            case 'random':
            default:
                proxy = activeProxies[Math.floor(Math.random() * activeProxies.length)];
                break;
        }

        proxy.lastUsed = now;
        return proxy.url;
    }

    reportSuccess(proxyUrl: string, responseTime: number) {
        const proxy = this.proxies.find(p => p.url === proxyUrl);
        if (proxy) {
            proxy.successes++;
            proxy.responseTime = proxy.responseTime === 0
                ? responseTime
                : (proxy.responseTime + responseTime) / 2;
        }
    }

    reportFailure(proxyUrl: string) {
        const proxy = this.proxies.find(p => p.url === proxyUrl);
        if (proxy) {
            proxy.failures++;

            //  Disable proxy after 3 failures for 5 minutes
            if (proxy.failures >= 3) {
                proxy.disabledUntil = Date.now() + 300000; // 5 min
                logger.warn(`Proxy ${proxyUrl} disabled after ${proxy.failures} failures`);
            }
        }
    }

    getStats() {
        return {
            total: this.proxies.length,
            active: this.proxies.filter(p => p.disabledUntil < Date.now()).length,
            strategy: this.rotationStrategy,
            proxies: this.proxies.map(p => ({
                url: p.url.replace(/\/\/.*:.*@/, '//***:***@'), // Hide credentials
                successes: p.successes,
                failures: p.failures,
                avgResponseTime: Math.round(p.responseTime),
                disabled: p.disabledUntil > Date.now()
            }))
        };
    }
}

// Singleton instance
export const proxyService = new ProxyService();
