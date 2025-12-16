import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProxyManager } from '../../../packages/shared/src/services/proxy-manager';
import { dragonfly } from '../../../packages/shared/src/database/dragonfly-client';
import { request } from 'undici';
import logger from '../../../packages/shared/src/utils/logger';

vi.mock('../../../packages/shared/src/database/dragonfly-client', () => ({
    dragonfly: {
        getClient: vi.fn()
    }
}));

vi.mock('../../../packages/shared/src/utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

vi.mock('undici', () => ({
    request: vi.fn(),
    ProxyAgent: vi.fn()
}));

describe('ProxyManager', () => {
    let manager: ProxyManager;
    let mockRedis: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockRedis = {
            set: vi.fn().mockResolvedValue('OK'),
            get: vi.fn(),
            sadd: vi.fn().mockResolvedValue(1),
            srem: vi.fn().mockResolvedValue(1),
            smembers: vi.fn().mockResolvedValue([]),
            del: vi.fn().mockResolvedValue(1),
            hgetall: vi.fn().mockResolvedValue({}),
            hincrby: vi.fn().mockResolvedValue(1),
            expire: vi.fn().mockResolvedValue(1),
        };
        (dragonfly.getClient as any).mockReturnValue(mockRedis);

        manager = new ProxyManager();
    });

    describe('addProxy', () => {
        it('should add a proxy to Redis', async () => {
            const result = await manager.addProxy('http://user:pass@host:8080', { type: 'residential' });

            expect(result.id).toBeDefined();
            expect(result.type).toBe('residential');

            // Verify Redis Storage
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.stringMatching(/^proxy:id:/),
                expect.any(String)
            );
            expect(mockRedis.sadd).toHaveBeenCalledWith('proxy:active:residential', result.id);
            expect(mockRedis.sadd).toHaveBeenCalledWith('proxy:all', result.id);
        });
    });

    describe('getNextProxy', () => {
        it('should retrieve a proxy from the pool', async () => {
            const proxyId = 'proxy-1';
            const mockProxy = { id: proxyId, url: 'http://proxy', type: 'datacenter' };

            mockRedis.smembers.mockResolvedValue([proxyId]);
            mockRedis.get.mockResolvedValue(JSON.stringify(mockProxy));

            const result = await manager.getNextProxy('datacenter');

            expect(result).toEqual(mockProxy);
            expect(mockRedis.smembers).toHaveBeenCalledWith('proxy:active:datacenter');
        });

        it('should NOT fallback to general pool in strict mode', async () => {
            // First call for 'datacenter' empty
            mockRedis.smembers.mockImplementation((key: string) => {
                if (key === 'proxy:active:datacenter') return Promise.resolve([]);
                if (key === 'proxy:active') return Promise.resolve(['proxy-backup']);
                return Promise.resolve([]);
            });

            const result = await manager.getNextProxy('datacenter');

            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('No active proxies found'));
        });

        it('should return null if no proxies available', async () => {
            mockRedis.smembers.mockResolvedValue([]);
            const result = await manager.getNextProxy('residential');
            expect(result).toBeNull();
        });
    });

    describe('reportFailure', () => {
        it('should increment error count', async () => {
            const proxy = { id: 'p1', errorCount: 0, type: 'datacenter', isActive: true };
            mockRedis.get.mockResolvedValue(JSON.stringify(proxy));

            await manager.reportFailure('p1', 'timeout');

            expect(mockRedis.set).toHaveBeenCalledWith(
                'proxy:id:p1',
                expect.stringContaining('"errorCount":1')
            );
        });

        it('should blacklist proxy after threshold errors', async () => {
            const proxy = { id: 'p1', errorCount: 4, type: 'datacenter', isActive: true };
            mockRedis.get.mockResolvedValue(JSON.stringify(proxy));

            await manager.reportFailure('p1', 'timeout'); // 5th error

            // Verify blacklisting
            expect(mockRedis.srem).toHaveBeenCalledWith('proxy:active', 'p1');
            expect(mockRedis.srem).toHaveBeenCalledWith('proxy:active:datacenter', 'p1');
            expect(mockRedis.sadd).toHaveBeenCalledWith('proxy:blacklisted', 'p1');
            expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('blacklisted'));
        });
    });

    describe('checkProxy', () => {
        it('should return true if proxy request succeeds (204)', async () => {
            const proxy = { id: 'p1', url: 'http://p1', type: 'datacenter' as const, protocol: 'http' as const, isActive: true, usageCount: 0, lastUsed: 0, errorCount: 0 };

            (request as any).mockResolvedValue({ statusCode: 204 });

            const result = await manager.checkProxy(proxy);

            expect(result).toBe(true);
            expect(request).toHaveBeenCalled();
        });

        it('should return false if proxy request fails', async () => {
            const proxy = { id: 'p1', url: 'http://p1', type: 'datacenter' as const, protocol: 'http' as const, isActive: true, usageCount: 0, lastUsed: 0, errorCount: 0 };

            (request as any).mockRejectedValue(new Error('Connection failed'));

            const result = await manager.checkProxy(proxy);

            expect(result).toBe(false);
            expect(logger.debug).toHaveBeenCalledWith(expect.any(Object), 'Proxy check failed');
        });
    });

    describe('getBestProxyForUrl', () => {
        it('should switch to residential if failure rate high', async () => {
            // Mock stats: 60% failure
            mockRedis.hgetall.mockResolvedValue({ total: '10', dcFail: '6' });

            // Mock residential pool
            const resId = 'res-1';
            const resProxy = { id: resId, url: 'http://res', type: 'residential' };

            mockRedis.smembers.mockImplementation((key: string) => {
                if (key === 'proxy:active:residential') return Promise.resolve([resId]);
                return Promise.resolve([]);
            });
            mockRedis.get.mockResolvedValue(JSON.stringify(resProxy));

            const result = await manager.getBestProxyForUrl('http://google.com');

            expect(result).toBe('http://res');
            expect(logger.info).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('Switching to Residential'));
        });
    });
});
