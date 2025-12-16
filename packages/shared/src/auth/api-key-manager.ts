import crypto from 'crypto';
import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import { APIKeyData, APIKeyMetadata, IAPIKeyManager, TIER_LIMITS } from '../types/api-key.interface.js';
import bcrypt from 'bcrypt';
import LRUCache from 'lru-cache';

const SALT_ROUNDS = 10;
const KEY_PREFIX_DEV = 'nx_sk_dev_';
const KEY_PREFIX_PROD = 'nx_pk_prod_';

export class APIKeyManager implements IAPIKeyManager {
    private readonly keyPrefix = 'apikey:';

    // L1 Cache: In-memory cache for validated API keys
    // Reduces Redis hits and expensive bcrypt hashes
    private readonly cache: LRUCache<string, APIKeyData>;

    constructor() {
        this.cache = new LRUCache({
            max: 1000, // Max 1000 keys in memory per instance
            ttl: 1000 * 60, // 60 seconds TTL (keys naturally expire/refresh)
            allowStale: false,
        });
    }

    /**
     * Generate a new API key
     */
    async generateKey(metadata: APIKeyMetadata): Promise<string> {
        try {
            // Generate secure random key
            const randomPart = crypto.randomBytes(24).toString('base64url');
            const prefix = process.env.NODE_ENV === 'production' ? KEY_PREFIX_PROD : KEY_PREFIX_DEV;
            const apiKey = `${prefix}${randomPart}`;

            // Hash the key for storage (never store plaintext)
            const keyHash = await bcrypt.hash(apiKey, SALT_ROUNDS);

            // Create key data
            const keyData: APIKeyData = {
                id: crypto.randomUUID(),
                keyHash,
                name: metadata.name,
                tier: metadata.tier,
                role: metadata.role || 'user',
                userId: metadata.userId,
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                requestCount: 0,
                isActive: true,
                rateLimit: TIER_LIMITS[metadata.tier]
            };

            const client = dragonfly.getClient();

            // 1. Store the main key data by ID
            await client.set(
                `${this.keyPrefix}id:${keyData.id}`,
                JSON.stringify(keyData)
            );

            // 2. Create O(1) lookup index: hash of the key -> ID
            // We can't use the raw key as index (security), but we can use a fast hash of it
            // This allows us to find the ID from the key without iterating
            const lookupHash = crypto.createHash('sha256').update(apiKey).digest('hex');
            await client.set(
                `${this.keyPrefix}lookup:${lookupHash}`,
                keyData.id
            );

            // 3. Add to user index if userId provided
            if (metadata.userId) {
                await client.sadd(`${this.keyPrefix}user:${metadata.userId}`, keyData.id);
            }

            // 4. Add to global index
            await client.sadd(`${this.keyPrefix}all`, keyData.id);

            logger.info({ keyId: keyData.id, tier: metadata.tier, name: metadata.name }, 'API key generated');

            // Return the plaintext key (only time user will see it)
            return apiKey;
        } catch (error) {
            logger.error({ error }, 'Failed to generate API key');
            throw error;
        }
    }

    /**
     * Validate an API key and return key data
     * Now O(1) complexity + L1 In-Memory Caching (Zero-latency)
     */
    async validateKey(apiKey: string): Promise<APIKeyData | null> {
        try {
            // 1. Check L1 Cache first (Fastest)
            // Note: We cache based on the apiKey itself since we have it here. 
            // In a real high-security env with huge memory pressure, we might hash it first for map key, 
            // but for <1000 keys, string key is fine and faster.
            const cachedKey = this.cache.get(apiKey);
            if (cachedKey) {
                // Return cached data immediately
                return cachedKey;
            }

            const client = dragonfly.getClient();

            // 2. Calculate lookup hash
            const lookupHash = crypto.createHash('sha256').update(apiKey).digest('hex');

            // 3. Look up the ID (O(1))
            const keyId = await client.get(`${this.keyPrefix}lookup:${lookupHash}`);

            if (!keyId) {
                // Fast fail - key doesn't exist
                return null;
            }

            // 4. Fetch key data (O(1))
            const data = await client.get(`${this.keyPrefix}id:${keyId}`);
            if (!data) return null;

            const keyData = JSON.parse(data) as APIKeyData;

            // 5. Verify with bcrypt (Security check) - Expensive!
            const isValid = await bcrypt.compare(apiKey, keyData.keyHash);

            if (isValid) {
                // Check if key is active
                if (!keyData.isActive) {
                    logger.warn({ keyId: keyData.id }, 'Attempted use of revoked API key');
                    return null;
                }

                // 6. Merge real-time stats (Atomic)
                // We do this even for cached keys (handled by updateKeyStats), 
                // but for fresh fetch we want latest.
                try {
                    const statsKey = `${this.keyPrefix}stats:${keyId}`;
                    const stats = await client.hgetall(statsKey);
                    if (stats && stats.requestCount) {
                        keyData.requestCount = parseInt(stats.requestCount) + (keyData.requestCount || 0);
                        keyData.lastUsedAt = parseInt(stats.lastUsedAt) || keyData.lastUsedAt;
                    }
                } catch (error: unknown) {
                    // Stats are non-critical for authentication, but log the error
                    logger.warn({ error, keyId }, 'Failed to fetch real-time stats, using cached data');
                    // Proceed with authentication using cached data
                }

                // 7. Store in L1 Cache
                this.cache.set(apiKey, keyData);

                return keyData;
            }

            logger.warn('Invalid API key attempt (hash collision or corruption)');
            return null;
        } catch (error) {
            logger.error({ error }, 'API key validation failed');
            return null;
        }
    }

    /**
     * Revoke an API key
     */
    async revokeKey(keyId: string): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const keyPath = `${this.keyPrefix}id:${keyId}`;

            const data = await client.get(keyPath);
            if (!data) throw new Error(`API key ${keyId} not found`);

            const keyData = JSON.parse(data) as APIKeyData;
            keyData.isActive = false;

            await client.set(keyPath, JSON.stringify(keyData));
            logger.info({ keyId }, 'API key revoked');
        } catch (error) {
            logger.error({ error, keyId }, 'Failed to revoke API key');
            throw error;
        }
    }

    /**
     * List all API keys (optionally filtered by userId)
     */
    async listKeys(userId?: string): Promise<APIKeyData[]> {
        try {
            const client = dragonfly.getClient();
            const keys: APIKeyData[] = [];
            let keyIds: string[] = [];

            if (userId) {
                keyIds = await client.smembers(`${this.keyPrefix}user:${userId}`);
            } else {
                keyIds = await client.smembers(`${this.keyPrefix}all`);
            }

            for (const keyId of keyIds) {
                const data = await client.get(`${this.keyPrefix}id:${keyId}`);
                if (data) {
                    keys.push(JSON.parse(data));
                }
            }

            return keys;
        } catch (error) {
            logger.error({ error, userId }, 'Failed to list API keys');
            return [];
        }
    }

    async updateKeyStats(keyId: string): Promise<void> {
        try {
            const client = dragonfly.getClient();
            // Use separate stats hash for atomicity (avoid JSON race conditions)
            const statsKey = `${this.keyPrefix}stats:${keyId}`;

            await client.hincrby(statsKey, 'requestCount', 1);
            await client.hset(statsKey, 'lastUsedAt', Date.now());

            // Note: We no longer update the main JSON blob for stats.
            // validateKey needs to merge this.
        } catch (error) {
            logger.warn({ error, keyId }, 'Failed to update key stats');
        }
    }

    /**
     * Register a pre-hashed key from admin panel
     * Used when admin panel generates keys and syncs to engine
     */
    async registerHashedKey(data: {
        keyHash: string;
        userId: string;
        tier: string;
        rateLimit: { maxRequests: number; windowSeconds: number };
        name?: string;
        role?: 'user' | 'admin' | 'service'; // Protocol Update
    }): Promise<string> {
        try {
            const keyId = crypto.randomUUID();

            // Create key data with pre-hashed key
            const keyData: APIKeyData = {
                id: keyId,
                keyHash: data.keyHash, // Already hashed by admin panel
                name: data.name ?? 'External API Key',
                tier: data.tier as any,
                role: (data.role as any) || 'user', // Allow role assignment (SaaS Admin Support)
                userId: data.userId,
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                requestCount: 0,
                isActive: true,
                rateLimit: data.rateLimit
            };

            const client = dragonfly.getClient();

            // Store the main key data by ID
            await client.set(
                `${this.keyPrefix}id:${keyId}`,
                JSON.stringify(keyData)
            );

            // Create lookup index: hash the already-hashed key for O(1) lookup
            const lookupHash = crypto.createHash('sha256').update(data.keyHash).digest('hex');
            await client.set(
                `${this.keyPrefix}lookup:${lookupHash}`,
                keyId
            );

            // Add to user index
            if (data.userId) {
                await client.sadd(`${this.keyPrefix}user:${data.userId}`, keyId);
            }

            // Add to global index
            await client.sadd(`${this.keyPrefix}all`, keyId);

            logger.info({ keyId, userId: data.userId, tier: data.tier }, 'Registered external API key');

            return keyId;
        } catch (error) {
            logger.error({ error }, 'Failed to register hashed API key');
            throw error;
        }
    }
    /**
     * Ensure the Admin Secret is registered as a valid API key
     * Call this on startup to replace the "backdoor" check
     */
    async ensureAdminKey(adminSecret: string): Promise<void> {
        try {
            if (!adminSecret || adminSecret.length < 20) {
                logger.warn('Skipping Admin Key registration: Secret too short or missing');
                return;
            }

            // 1. Check if already exists (Optimization)
            const lookupHash = crypto.createHash('sha256').update(adminSecret).digest('hex');
            const client = dragonfly.getClient();
            const existingId = await client.get(`${this.keyPrefix}lookup:${lookupHash}`);

            if (existingId) {
                // Ensure it's active and has admin role
                const data = await client.get(`${this.keyPrefix}id:${existingId}`);
                if (data) {
                    const keyData = JSON.parse(data) as APIKeyData;
                    if (keyData.role !== 'admin' || !keyData.isActive) {
                        logger.info({ keyId: existingId }, 'Updating existing Admin Key permissions');
                        keyData.role = 'admin';
                        keyData.isActive = true;
                        keyData.tier = 'pro';
                        await client.set(`${this.keyPrefix}id:${existingId}`, JSON.stringify(keyData));
                    }
                    return; // Already registered
                }
            }

            logger.info('🔐 Registering Admin Secret as secure API Key...');

            // 2. Hash the secret securely
            const keyHash = await bcrypt.hash(adminSecret, SALT_ROUNDS);

            // 3. Create Key Data
            const keyId = crypto.randomUUID();
            const keyData: APIKeyData = {
                id: keyId,
                keyHash,
                name: 'Master Admin',
                tier: 'pro',
                role: 'admin',      // Critical
                userId: 'system-admin',
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                requestCount: 0,
                isActive: true,
                rateLimit: { maxRequests: 1000, windowSeconds: 60 } // High limits for admin
            };

            // 4. Store in Redis
            // Store ID mapper
            await client.set(`${this.keyPrefix}id:${keyId}`, JSON.stringify(keyData));
            // Store O(1) Lookup
            await client.set(`${this.keyPrefix}lookup:${lookupHash}`, keyId);
            // Add to indices
            await client.sadd(`${this.keyPrefix}user:system-admin`, keyId);
            await client.sadd(`${this.keyPrefix}all`, keyId);

            logger.info({ keyId }, '✅ Admin Secret securely registered');

        } catch (error) {
            logger.error({ error }, 'Failed to ensure Admin Key registration');
            throw error;
        }
    }
}



/**
 * Factory function to create APIKeyManager instance
 */
export function createApiKeyManager(): APIKeyManager {
    return new APIKeyManager();
}

/**
 * @deprecated Use createApiKeyManager() or inject via DI container
 */
export const apiKeyManager = createApiKeyManager();

