import crypto from 'crypto';
import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import { APIKeyData, APIKeyMetadata, IAPIKeyManager, TIER_LIMITS } from '../types/api-key.interface.js';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;
const KEY_PREFIX_DEV = 'nx_sk_dev_';
const KEY_PREFIX_PROD = 'nx_pk_prod_';

export class APIKeyManager implements IAPIKeyManager {
    private readonly keyPrefix = 'apikey:';

    /**
     * Generate a new API key
     */
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
     * Now O(1) complexity!
     */
    async validateKey(apiKey: string): Promise<APIKeyData | null> {
        try {
            const client = dragonfly.getClient();

            // 1. Calculate lookup hash
            const lookupHash = crypto.createHash('sha256').update(apiKey).digest('hex');

            // 2. Look up the ID (O(1))
            const keyId = await client.get(`${this.keyPrefix}lookup:${lookupHash}`);

            if (!keyId) {
                // Fast fail - key doesn't exist
                return null;
            }

            // 3. Fetch key data (O(1))
            const data = await client.get(`${this.keyPrefix}id:${keyId}`);
            if (!data) return null;

            const keyData = JSON.parse(data) as APIKeyData;

            // 4. Verify with bcrypt (Security check)
            // Even though we found it via SHA256, we still verify the bcrypt hash
            // to ensure the key matches exactly what was stored securely
            const isValid = await bcrypt.compare(apiKey, keyData.keyHash);

            if (isValid) {
                // Check if key is active
                if (!keyData.isActive) {
                    logger.warn({ keyId: keyData.id }, 'Attempted use of revoked API key');
                    return null;
                }

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

    /**
     * Update key usage statistics
     */
    async updateKeyStats(keyId: string): Promise<void> {
        try {
            const client = dragonfly.getClient();
            const keyPath = `${this.keyPrefix}id:${keyId}`;

            const data = await client.get(keyPath);
            if (!data) return;

            const keyData = JSON.parse(data) as APIKeyData;
            keyData.lastUsedAt = Date.now();
            keyData.requestCount++;

            await client.set(keyPath, JSON.stringify(keyData));
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
    }): Promise<string> {
        try {
            const keyId = crypto.randomUUID();

            // Create key data with pre-hashed key
            const keyData: APIKeyData = {
                id: keyId,
                keyHash: data.keyHash, // Already hashed by admin panel
                name: data.name ?? 'External API Key',
                tier: data.tier as any,
                role: 'user', // Default external keys to user role for now
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
}

// Singleton instance
export const apiKeyManager = new APIKeyManager();

