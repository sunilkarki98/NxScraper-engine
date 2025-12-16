import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueManager } from './queue-manager.js';
import { Queue } from 'bullmq';

// Hoist mocks to ensure they are available before imports/mocks
const mocks = vi.hoisted(() => {
    return {
        executeMock: vi.fn().mockImplementation(async (fn: any) => await fn()),
        mockQueueHelper: {
            add: vi.fn().mockResolvedValue({ id: 'job-1' }),
            getJob: vi.fn(),
            getJobCounts: vi.fn().mockResolvedValue({ wait: 0, active: 0, completed: 0, failed: 0 })
        }
    };
});

vi.mock('../database/dragonfly-client.js', () => ({
    dragonfly: {
        getClient: vi.fn()
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

vi.mock('../utils/env-validator.js', () => ({
    env: {
        DRAGONFLY_URL: 'redis://localhost:6379'
    }
}));

vi.mock('bullmq', () => {
    return {
        Queue: vi.fn(function () { return mocks.mockQueueHelper; }),
        QueueEvents: vi.fn(function () { })
    };
});

vi.mock('../utils/circuit-breaker.js', () => {
    return {
        CircuitBreaker: class {
            execute = mocks.executeMock;
        }
    };
});

describe('QueueManager', () => {
    let manager: QueueManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new QueueManager();
    });

    describe('addJob', () => {
        it('should initialize queues on first add', async () => {
            await manager.addJob('scrape', { url: 'http://example.com' });

            expect(Queue).toHaveBeenCalledWith('scrape-queue', expect.any(Object));
            expect(Queue).toHaveBeenCalledWith('ai-queue', expect.any(Object));
        });

        it('should add job via CircuitBreaker', async () => {
            const result = await manager.addJob('scrape', { url: 'http://example.com' });

            expect(result.id).toBe('job-1');

            // Verify CircuitBreaker execute was called
            expect(mocks.executeMock).toHaveBeenCalled();
            // Verify Queue.add was called
            expect(mocks.mockQueueHelper.add).toHaveBeenCalled();
        });

        it('should default to ai-queue for unknown types', async () => {
            // @ts-ignore
            const result = await manager.addJob('invalid', {});
            expect(result.id).toBe('job-1');
        });
    });

    describe('getMetrics', () => {
        it('should return metrics with correct keys', async () => {
            const metrics = await manager.getMetrics('scrape');
            expect(metrics).toEqual({ waiting: 0, active: 0, completed: 0, failed: 0 });
        });
    });
});
