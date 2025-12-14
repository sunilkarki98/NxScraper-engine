import { Redis } from 'ioredis';
import logger from '../utils/logger.js';
import { env } from '../utils/env-validator.js';

// Type alias to avoid namespace/type conflicts
type RedisClient = Redis;

class DragonflyClient {
    private client: RedisClient | null = null;
    private subscriber: RedisClient | null = null;

    constructor() {
        // Initialization deferred until connect() or usage
    }

    private init() {
        if (this.client) return;

        // Use validated environment configuration (lazy access)
        const url = env.DRAGONFLY_URL;

        // Dragonfly is fully compatible with Redis, so we use ioredis
        // We optimize for Dragonfly's multi-threaded architecture
        this.client = new Redis(url, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
            keepAlive: 10000,
            connectTimeout: 10000,
            retryStrategy: (times: number) => {
                if (times > 10) {
                    logger.warn('DragonflyDB connection failed after 10 retries');
                    return null;
                }
                const delay = Math.min(times * 100, 3000);
                return delay;
            }
        });

        this.subscriber = new Redis(url, {
            lazyConnect: true,
            maxRetriesPerRequest: null // Subscribers handle reconnection differently
        });

        this.setupEventHandlers(this.client, 'Client');
        this.setupEventHandlers(this.subscriber, 'Subscriber');
    }

    private setupEventHandlers(instance: RedisClient, name: string) {
        instance.on('connect', () => {
            logger.info(`🐉 DragonflyDB ${name} connected`);
        });

        instance.on('error', (err: Error) => {
            logger.warn({ err: err.message }, `DragonflyDB ${name} error`);
        });

        instance.on('ready', () => {
            logger.debug(`DragonflyDB ${name} ready`);
        });
    }

    async connect(): Promise<void> {
        this.init();
        if (this.client?.status === 'wait') {
            await this.client.connect();
        }
        if (this.subscriber?.status === 'wait') {
            await this.subscriber.connect();
        }
        logger.info('🐉 DragonflyDB fully connected');
    }

    getClient(): RedisClient {
        this.init();
        return this.client!;
    }

    getSubscriber(): RedisClient {
        this.init();
        return this.subscriber!;
    }

    async disconnect(): Promise<void> {
        if (this.client) await this.client.quit();
        if (this.subscriber) await this.subscriber.quit();
        logger.info('DragonflyDB disconnected');
    }
}

// Singleton instance
export const dragonfly = new DragonflyClient();
