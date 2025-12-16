import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APIKeyManager } from './api-key-manager.js';
import { dragonfly } from '../database/dragonfly-client.js';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';

// Mock dependencies
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

// Mock bcrypt to avoid CPU intensive hashing during tests
vi.mock('bcrypt', async () => {
    return {
        default: {
            hash: vi.fn().mockResolvedValue('hashed_secret'),
            compare: vi.fn().mockResolvedValue(true)
        }
    };
});

describe('APIKeyManager', () => {
    let manager: APIKeyManager;
    let mockRedis: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup Mock Redis
        mockRedis = {
            set: vi.fn().mockResolvedValue('OK'),
            get: vi.fn(),
            sadd: vi.fn().mockResolvedValue(1),
            smembers: vi.fn().mockResolvedValue([]),
            hgetall: vi.fn().mockResolvedValue({}),
            hincrby: vi.fn().mockResolvedValue(1),
            hset: vi.fn().mockResolvedValue(1),
        };
        (dragonfly.getClient as any).mockReturnValue(mockRedis);

        manager = new APIKeyManager();
    });

    describe('generateKey', () => {
        it('should generate a key, hash it, and store in Redis', async () => {
            const metadata = { name: 'Test Key', tier: 'free' as const, userId: 'user-123' };
            const apiKey = await manager.generateKey(metadata);

            expect(apiKey).toBeDefined();
            expect(typeof apiKey).toBe('string');
            expect(apiKey.length).toBeGreaterThan(20);

            // Verify bcrypt usage
            expect(bcrypt.hash).toHaveBeenCalled();

            // Verify Redis storage
            // 1. Store by ID
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.stringMatching(/^apikey:id:/),
                expect.any(String)
            );
            // 2. Store lookup hash
            expect(mockRedis.set).toHaveBeenCalledWith(
                expect.stringMatching(/^apikey:lookup:/),
                expect.any(String)
            );
            // 3. Add to user index
            expect(mockRedis.sadd).toHaveBeenCalledWith(
                'apikey:user:user-123',
                expect.any(String)
            );
        });
    });

    describe('validateKey', () => {
        it('should return key data if valid', async () => {
            const mockKeyData = {
                id: 'key-123',
                keyHash: 'hashed_secret',
                tier: 'free',
                isActive: true,
                requestCount: 0
            };
            const apiKey = 'nx_sk_dev_testkey123';

            // Mock Redis responses
            mockRedis.get.mockImplementation((key: string) => {
                if (key.includes(':lookup:')) return Promise.resolve('key-123');
                if (key.includes(':id:key-123')) return Promise.resolve(JSON.stringify(mockKeyData));
                return Promise.resolve(null);
            });
            mockRedis.hgetall.mockResolvedValue({ requestCount: '10' });

            (bcrypt.compare as any).mockResolvedValue(true);

            const result = await manager.validateKey(apiKey);

            expect(result).toBeDefined();
            expect(result?.id).toBe('key-123');
            expect(result?.requestCount).toBe(10); // Merged stats
            expect(bcrypt.compare).toHaveBeenCalledWith(apiKey, 'hashed_secret');
        });

        it('should return null if key not found', async () => {
            mockRedis.get.mockResolvedValue(null);
            const result = await manager.validateKey('invalid-key');
            expect(result).toBeNull();
        });

        it('should return null if key is revoked (isActive: false)', async () => {
            const mockKeyData = {
                id: 'key-123',
                keyHash: 'hashed_secret',
                tier: 'free',
                isActive: false // Revoked
            };

            mockRedis.get.mockImplementation((key: string) => {
                if (key.includes(':lookup:')) return Promise.resolve('key-123');
                if (key.includes(':id:key-123')) return Promise.resolve(JSON.stringify(mockKeyData));
                return Promise.resolve(null);
            });
            (bcrypt.compare as any).mockResolvedValue(true);

            const result = await manager.validateKey('revoked-key');
            expect(result).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith(expect.any(Object), expect.stringContaining('revoked'));
        });
    });

    describe('revokeKey', () => {
        it('should set isActive to false', async () => {
            const mockKeyData = { id: 'key-123', isActive: true };
            mockRedis.get.mockResolvedValue(JSON.stringify(mockKeyData));

            await manager.revokeKey('key-123');

            expect(mockRedis.set).toHaveBeenCalledWith(
                'apikey:id:key-123',
                expect.stringContaining('"isActive":false')
            );
        });
    });
});
