import { dragonfly } from '../database/dragonfly-client.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { encrypt, decrypt } from '../utils/encryption.js';

export interface ExternalKey {
    id: string;
    provider: string; // e.g., 'openai', 'anthropic', 'proxy-brightdata'
    value: string;    // The actual API key
    name?: string;    // Optional label
    isActive: boolean;
    usageCount: number;
    lastUsed: number;
    errorCount: number;
    lastError?: string;
    lastErrorTime?: number;
}

export class ExternalKeyManager {
    private readonly keyPrefix = 'ext:key:';
    private readonly providerPrefix = 'ext:provider:';

    /**
     * Add a new external key
     */
    async addKey(provider: string, value: string, name?: string): Promise<ExternalKey> {
        const id = crypto.randomUUID();
        const key: ExternalKey = {
            id,
            provider,
            value: encrypt(value),
            name,
            isActive: true,
            usageCount: 0,
            lastUsed: 0,
            errorCount: 0
        };

        const client = dragonfly.getClient();

        // Store key data
        await client.set(`${this.keyPrefix}${id}`, JSON.stringify(key));

        // Add to provider set
        await client.sadd(`${this.providerPrefix}${provider}`, id);

        // Add to global set (for scalable listing)
        await client.sadd(`${this.keyPrefix}all`, id);

        logger.info({ provider, keyId: id }, 'External key added');
        return key;
    }

    /**
     * Get a healthy key for a provider (Round Robin / Least Used)
     */
    async getKey(provider: string): Promise<ExternalKey | null> {
        const client = dragonfly.getClient();
        const keyIds = await client.smembers(`${this.providerPrefix}${provider}`);

        if (keyIds.length === 0) {
            // Fallback to env vars if no dynamic keys found
            const envKey = this.getEnvKey(provider);
            if (envKey) {
                // Audit SEC-02: Warn on env fallback in production
                if (process.env.NODE_ENV === 'production') {
                    logger.warn({ provider }, 'FALLBACK: Using environment variable API key in PRODUCTION. Recommend using DB keys.');
                }
                return {
                    id: 'env',
                    provider,
                    value: envKey,
                    isActive: true,
                    usageCount: 0,
                    lastUsed: Date.now(),
                    errorCount: 0
                };
            }
            return null;
        }

        // Fetch all keys in parallel using MGET (Audit ARCH-01)
        const dbKeys = keyIds.map(id => `${this.keyPrefix}${id}`);
        const values = await client.mget(dbKeys);

        const keys: ExternalKey[] = [];

        // Use standard for loop for performance
        for (let i = 0; i < values.length; i++) {
            const data = values[i];
            if (data) {
                try {
                    const key = JSON.parse(data) as ExternalKey;
                    // Decrypt value for usage
                    key.value = decrypt(key.value);
                    keys.push(key);
                } catch (err) {
                    const id = keyIds[i]; // correlated by index
                    logger.warn({ keyId: id }, 'Failed to decrypt/parse key data, skipping');
                }
            }
        }

        // Filter active and healthy keys
        const healthyKeys = keys.filter(k => k.isActive && k.errorCount < 5);

        if (healthyKeys.length === 0) {
            logger.warn({ provider }, 'No healthy external keys available');
            return null;
        }

        // Sort by last used (Round Robin-ish)
        healthyKeys.sort((a, b) => a.lastUsed - b.lastUsed);

        const selectedKey = healthyKeys[0];

        // Update usage stats (async)
        this.updateKeyUsage(selectedKey.id).catch(err =>
            logger.warn({ err }, 'Failed to update external key usage')
        );

        return selectedKey;
    }

    /**
     * Report a key failure (to disable bad keys)
     */
    async reportFailure(keyId: string, error: string): Promise<void> {
        if (keyId === 'env') return; // Can't track env keys

        try {
            const client = dragonfly.getClient();
            const data = await client.get(`${this.keyPrefix}${keyId}`);

            if (data) {
                const key = JSON.parse(data) as ExternalKey;
                key.errorCount++;
                key.lastError = error;
                key.lastErrorTime = Date.now();

                // Auto-disable if too many errors
                if (key.errorCount >= 10) {
                    key.isActive = false;
                    logger.error({ keyId, provider: key.provider }, 'External key disabled due to excessive errors');
                }

                await client.set(`${this.keyPrefix}${keyId}`, JSON.stringify(key));
            }
        } catch (err) {
            logger.error({ err }, 'Failed to report key failure');
        }
    }

    /**
     * Report success (to reset error count)
     */
    async reportSuccess(keyId: string): Promise<void> {
        if (keyId === 'env') return;

        try {
            const client = dragonfly.getClient();
            const data = await client.get(`${this.keyPrefix}${keyId}`);

            if (data) {
                const key = JSON.parse(data) as ExternalKey;
                if (key.errorCount > 0) {
                    key.errorCount = 0; // Reset on success
                    key.lastError = undefined;
                    await client.set(`${this.keyPrefix}${keyId}`, JSON.stringify(key));
                }
            }
        } catch (err) {
            // Ignore
        }
    }

    private async updateKeyUsage(keyId: string) {
        const client = dragonfly.getClient();
        const data = await client.get(`${this.keyPrefix}${keyId}`);
        if (data) {
            const key = JSON.parse(data) as ExternalKey;
            key.lastUsed = Date.now();
            key.usageCount++;
            await client.set(`${this.keyPrefix}${keyId}`, JSON.stringify(key));
        }
    }

    private getEnvKey(provider: string): string | undefined {
        switch (provider) {
            case 'openai': return process.env.OPENAI_API_KEY;
            case 'anthropic': return process.env.ANTHROPIC_API_KEY;
            case 'gemini': return process.env.GEMINI_API_KEY;
            case 'deepseek': return process.env.DEEPSEEK_API_KEY;
            case 'openrouter': return process.env.OPENROUTER_API_KEY;
            default: return undefined;
        }
    }
    /**
     * List external keys
     */
    async listKeys(provider?: string): Promise<any[]> {
        const client = dragonfly.getClient();
        // Use set members instead of keys command for scalability
        const keyIds = await client.smembers(`${this.keyPrefix}all`);
        const results = [];

        for (const id of keyIds) {
            const data = await client.get(`${this.keyPrefix}${id}`);
            if (data) {
                const keyData = JSON.parse(data);

                let maskedValue = 'invalid-encrypted-data';
                try {
                    // Decrypt momentarily to show mask
                    const plain = decrypt(keyData.value);
                    maskedValue = 'sk-...' + plain.slice(-4);
                } catch {
                    // Ignore decryption errors for list view
                }

                if (!provider || keyData.provider === provider) {
                    results.push({
                        id: keyData.id,
                        provider: keyData.provider,
                        name: keyData.name,
                        status: keyData.isActive ? 'active' : 'inactive',
                        usageCount: keyData.usageCount,
                        lastUsed: keyData.lastUsed,
                        lastError: keyData.lastError,
                        // Mask the value
                        value: maskedValue
                    });
                }
            }
        }
        return results;
    }

    /**
     * Remove an external key
     */
    async removeKey(id: string): Promise<void> {
        const client = dragonfly.getClient();
        const key = `${this.keyPrefix}${id}`; // Fix: key prefix was inconsistent in previous edit
        const data = await client.get(key);

        if (data) {
            const keyData = JSON.parse(data);
            // Remove from provider set
            await client.srem(`${this.providerPrefix}${keyData.provider}`, id);
            // Remove from global set
            await client.srem(`${this.keyPrefix}all`, id);
            // Remove key data
            await client.del(key);
            logger.info({ id, provider: keyData.provider }, 'Removed external API key');
        }
    }
}

export const externalKeyManager = new ExternalKeyManager();
