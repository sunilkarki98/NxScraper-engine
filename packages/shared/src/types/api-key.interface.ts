// Type definitions
export type Tier = 'free' | 'pro';
export type Role = 'user' | 'admin';

export interface RateLimit {
    maxRequests: number;
    windowSeconds: number;
}

export interface APIKeyData {
    id: string;
    keyHash: string;  // bcrypt hash of the API key
    name: string;     // User-friendly name (e.g., "Production App")
    tier: Tier;
    role: Role;       // 'user' or 'admin'
    userId?: string;  // Optional user/tenant association
    createdAt: number;
    lastUsedAt: number;
    requestCount: number;
    isActive: boolean;
    rateLimit: RateLimit;
}

export interface APIKeyMetadata {
    name: string;
    tier: Tier;
    role?: Role;
    userId?: string;
}

export interface IAPIKeyManager {
    generateKey(metadata: APIKeyMetadata): Promise<string>;
    validateKey(apiKey: string): Promise<APIKeyData | null>;
    revokeKey(keyId: string): Promise<void>;
    listKeys(userId?: string): Promise<APIKeyData[]>;
    updateKeyStats(keyId: string): Promise<void>;

    // New: Register pre-generated key from admin panel
    registerHashedKey(data: {
        keyHash: string;
        userId: string;
        tier: Tier;
        rateLimit: RateLimit;
        name?: string;
    }): Promise<string>; // Returns the internal key ID
}

// Tier configuration
export const TIER_LIMITS: Record<string, { maxRequests: number; windowSeconds: number }> = {
    free: { maxRequests: 100, windowSeconds: 3600 },      // 100 requests per hour
    pro: { maxRequests: 1000, windowSeconds: 3600 },      // 1000 requests per hour
};
