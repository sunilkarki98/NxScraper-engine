import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from './event-bus.js';
import { dragonfly } from '../database/dragonfly-client.js';

// Hoist mocks
const mocks = vi.hoisted(() => {
    return {
        subscriber: {
            connect: vi.fn().mockResolvedValue('OK'),
            on: vi.fn(),
            subscribe: vi.fn().mockResolvedValue('OK'),
            publish: vi.fn().mockResolvedValue(1)
        },
        client: {
            publish: vi.fn().mockResolvedValue(1)
        }
    };
});

vi.mock('../database/dragonfly-client.js', () => ({
    dragonfly: {
        getSubscriber: vi.fn(() => mocks.subscriber),
        getClient: vi.fn(() => mocks.client),
        createSubscriber: vi.fn(() => mocks.subscriber)
    }
}));

vi.mock('../utils/logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        vi.clearAllMocks();
        // Since EventBus calls initialize() in constructor, we can test it immediately
        eventBus = new EventBus();
    });

    describe('initialize', () => {
        it('should connect subscriber and subscribe to channels', () => {
            expect(mocks.subscriber.connect).toHaveBeenCalled();
            expect(mocks.subscriber.subscribe).toHaveBeenCalledWith(
                'system:events', 'scraper:events', 'config:updates'
            );
            expect(mocks.subscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
        });
    });

    describe('publish', () => {
        it('should publish message to Redis', async () => {
            const payload = { foo: 'bar' };
            await eventBus.publish('system:events', 'TEST_EVENT', payload);

            expect(mocks.client.publish).toHaveBeenCalledWith(
                'system:events',
                expect.stringContaining('"type":"TEST_EVENT"')
            );
            expect(mocks.client.publish).toHaveBeenCalledWith(
                'system:events',
                expect.stringContaining('"payload":{"foo":"bar"}')
            );
        });
    });

    describe('subscribe', () => {
        it('should trigger callback when message received', async () => {
            const callback = vi.fn();
            eventBus.subscribe('system:events', callback);

            // Simulate incoming Redis message
            // Get the handler registered in initialize
            const messageHandler = mocks.subscriber.on.mock.calls.find(call => call[0] === 'message')?.[1];
            expect(messageHandler).toBeDefined();

            const eventData = {
                type: 'TEST_EVENT',
                payload: { foo: 'bar' },
                source: 'test-host',
                timestamp: Date.now()
            };

            // Invoke handler
            messageHandler('system:events', JSON.stringify(eventData));

            expect(callback).toHaveBeenCalledWith(eventData);
        });

        it('should ignore data on wrong channel', async () => {
            const callback = vi.fn();
            eventBus.subscribe('system:events', callback);

            const messageHandler = mocks.subscriber.on.mock.calls.find(call => call[0] === 'message')?.[1];

            // Send on different channel
            messageHandler('scraper:events', JSON.stringify({ type: 'TEST' }));

            expect(callback).not.toHaveBeenCalled();
        });
    });
});
