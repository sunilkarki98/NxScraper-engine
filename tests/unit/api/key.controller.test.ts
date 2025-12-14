import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyController } from '@core/api/controllers/key.controller';
import { createMockRequest, createMockResponse } from '../../utils/test-helpers';

// Fix hoisting issue
const mocks = vi.hoisted(() => {
    return {
        apiKeyManager: {
            generateKey: vi.fn(),
            registerHashedKey: vi.fn(),
            listKeys: vi.fn(),
            revokeKey: vi.fn()
        },
        externalKeyManager: {
            addKey: vi.fn(),
            listKeys: vi.fn(),
            removeKey: vi.fn()
        },
        logger: {
            info: vi.fn(),
            error: vi.fn()
        }
    };
});

vi.mock('@nx-scraper/shared/auth/api-key-manager', () => ({
    apiKeyManager: mocks.apiKeyManager
}));

vi.mock('@nx-scraper/shared/auth/external-key-manager', () => ({
    externalKeyManager: mocks.externalKeyManager
}));

vi.mock('@nx-scraper/shared/utils/logger', () => ({
    default: mocks.logger
}));

describe('KeyController', () => {
    let controller: KeyController;

    beforeEach(() => {
        controller = new KeyController();
        vi.clearAllMocks();
    });

    describe('generateInternalKey', () => {
        it('should generate a new key successfully', async () => {
            const req = createMockRequest({
                userId: 'user-123',
                tier: 'pro',
                metadata: { name: 'My Key' }
            });
            const res = createMockResponse();

            mocks.apiKeyManager.generateKey.mockResolvedValue({
                key: 'sk-test-key',
                id: 'key-123'
            });

            await controller.generateInternalKey(req, res);

            expect(mocks.apiKeyManager.generateKey).toHaveBeenCalledWith({
                userId: 'user-123',
                tier: 'pro',
                name: 'My Key'
            });
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: expect.objectContaining({ key: 'sk-test-key' })
            }));
        });

        it('should return 400 if userId is missing', async () => {
            const req = createMockRequest({ tier: 'free' });
            const res = createMockResponse();

            await controller.generateInternalKey(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
        });
    });

    describe('registerInternalKey', () => {
        it('should register a hashed key successfully', async () => {
            const req = createMockRequest({
                keyHash: 'hash-123',
                userId: 'user-123',
                rateLimit: { maxRequests: 100, windowSeconds: 60 }
            });
            const res = createMockResponse();

            mocks.apiKeyManager.registerHashedKey.mockResolvedValue('key-id-123');

            await controller.registerInternalKey(req, res);

            expect(mocks.apiKeyManager.registerHashedKey).toHaveBeenCalledWith(expect.objectContaining({
                keyHash: 'hash-123',
                userId: 'user-123'
            }));
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                data: { id: 'key-id-123' }
            }));
        });

        it('should return 400 for missing required fields', async () => {
            const req = createMockRequest({ userId: 'user-123' }); // Missing keyHash and rateLimit
            const res = createMockResponse();

            await controller.registerInternalKey(req, res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(mocks.apiKeyManager.registerHashedKey).not.toHaveBeenCalled();
        });
    });

    describe('listInternalKeys', () => {
        it('should list keys for a user', async () => {
            // Helper signature: createMockRequest(body, query, params)
            // Fix: pass userId in 2nd argument (query)
            const req = createMockRequest({}, { userId: 'user-123' }, {});
            const res = createMockResponse();

            const mockKeys = [{ id: 'k1', prefix: 'sk-...' }];
            mocks.apiKeyManager.listKeys.mockResolvedValue(mockKeys);

            await controller.listInternalKeys(req, res);

            expect(mocks.apiKeyManager.listKeys).toHaveBeenCalledWith('user-123');
            expect(res.json).toHaveBeenCalledWith({
                success: true,
                data: mockKeys
            });
        });
    });

    describe('revokeInternalKey', () => {
        it('should revoke a key', async () => {
            // Helper signature: createMockRequest(body, query, params)
            // Fix: pass id in 3rd argument (params)
            const req = createMockRequest({}, {}, { id: 'key-123' });
            const res = createMockResponse();

            await controller.revokeInternalKey(req, res);

            expect(mocks.apiKeyManager.revokeKey).toHaveBeenCalledWith('key-123');
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
    });

    describe('addExternalKey', () => {
        it('should add an external key', async () => {
            const req = createMockRequest({
                provider: 'openai',
                value: 'sk-openai-key',
                name: 'My OpenAI'
            });
            const res = createMockResponse();

            mocks.externalKeyManager.addKey.mockResolvedValue('ext-key-1');

            await controller.addExternalKey(req, res);

            expect(mocks.externalKeyManager.addKey).toHaveBeenCalledWith('openai', 'sk-openai-key', 'My OpenAI');
            expect(res.status).toHaveBeenCalledWith(201);
        });
    });
});
