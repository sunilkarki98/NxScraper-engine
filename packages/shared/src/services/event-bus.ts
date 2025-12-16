import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import { EventEmitter } from 'events';

export type EventChannel = 'system:events' | 'scraper:events' | 'config:updates';

export interface SystemEvent {
    type: string;
    payload: unknown;
    source: string;
    timestamp: number;
}

export class EventBus {
    private subscriberClient = dragonfly.getSubscriber();
    private publisherClient = dragonfly.getClient();
    private localEmitter = new EventEmitter();
    private initialized = false;

    constructor() {
        this.initialize();
    }

    private async initialize() {
        if (this.initialized) return;

        try {
            await this.subscriberClient.connect();

            // Listen to Redis messages and emit locally
            this.subscriberClient.on('message', (channel, message) => {
                try {
                    const parsed = JSON.parse(message);
                    this.localEmitter.emit(channel, parsed);
                } catch (error) {
                    logger.error({ error, channel }, 'Failed to parse event bus message');
                }
            });

            // Subscribe to all standard channels
            const channels: EventChannel[] = ['system:events', 'scraper:events', 'config:updates'];
            await this.subscriberClient.subscribe(...channels);

            this.initialized = true;
            logger.info('📡 EventBus initialized and subscribed');
        } catch (error) {
            logger.error({ error }, 'Failed to initialize EventBus');
        }
    }

    /**
     * Publish an event to the distributed bus
     */
    async publish(channel: EventChannel, type: string, payload: unknown): Promise<void> {
        const event: SystemEvent = {
            type,
            payload,
            source: process.env.HOSTNAME || 'unknown',
            timestamp: Date.now()
        };

        try {
            await this.publisherClient.publish(channel, JSON.stringify(event));
        } catch (error) {
            logger.error({ error, channel }, 'Failed to publish event');
        }
    }

    /**
     * Subscribe to events
     */
    subscribe(channel: EventChannel, callback: (event: SystemEvent) => void): void {
        this.localEmitter.on(channel, callback);
    }

    /**
     * Unsubscribe
     */
    unsubscribe(channel: EventChannel, callback: (event: SystemEvent) => void): void {
        this.localEmitter.off(channel, callback);
    }
}

/**
 * Factory for DI
 */
export function createEventBus(): EventBus {
    return new EventBus();
}
