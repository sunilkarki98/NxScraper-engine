import { createHash } from 'crypto';
import { dragonfly } from '../../database/dragonfly-client.js';
import { LLMOptions } from '../llm/interfaces.js';
import logger from '../../utils/logger.js';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { Counter, Histogram, Metric } from 'prom-client';
import { register } from '../../observability/metrics.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// Metrics Definitions
// Use getSingleMetric to prevent "Metric already registered" errors on hot reload
const getOrCreateMetric = <T extends Metric>(name: string, factory: () => T): T => {
    const existing = register.getSingleMetric(name);
    if (existing) return existing as T;
    const metric = factory();
    return metric;
};

const cacheHits = getOrCreateMetric('ai_cache_hits_total', () => new Counter({
    name: 'ai_cache_hits_total',
    help: 'Total number of AI cache hits',
    labelNames: ['type'],
    registers: [register]
}));

const cacheMisses = getOrCreateMetric('ai_cache_misses_total', () => new Counter({
    name: 'ai_cache_misses_total',
    help: 'Total number of AI cache misses',
    labelNames: ['type'],
    registers: [register]
}));

const cacheLatency = getOrCreateMetric('ai_cache_operation_duration_seconds', () => new Histogram({
    name: 'ai_cache_operation_duration_seconds',
    help: 'Duration of AI cache operations',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
    labelNames: ['operation'],
    registers: [register]
}));

const cacheCompressionSavings = getOrCreateMetric('ai_cache_compression_savings_bytes', () => new Counter({
    name: 'ai_cache_compression_savings_bytes',
    help: 'Total bytes saved by cache compression',
    registers: [register]
}));

interface CompressedValue {
    _c: boolean; // Compressed flag
    d: string;   // Base64 encoded gzipped data
}

/**
 * AI Cache - Distributed caching for LLM responses using DragonflyDB
 * Features:
 * - Gzip compression for values > 1KB
 * - Prometheus metrics
 * - Backward compatibility with raw JSON
 */
export class AICache {
    private readonly prefix = 'ai:cache:';
    private readonly defaultTTL = 86400; // 24 hours
    private readonly COMPRESSION_THRESHOLD = 1024; // 1KB

    constructor() {
        logger.info('🧠 AI Cache initialized (Compression enabled > 1KB, Metrics enabled)');
    }

    /**
     * Get cached value by key
     */
    async get<T>(key: string): Promise<T | null> {
        const timer = cacheLatency.startTimer({ operation: 'get' });
        try {
            const client = await dragonfly.getClient();
            const data = await client.get(this.prefix + key);

            if (!data) {
                cacheMisses.inc({ type: 'generic' });
                return null;
            }

            cacheHits.inc({ type: 'generic' });

            let parsed: any;
            try {
                parsed = JSON.parse(data);
            } catch {
                // Return raw if not JSON (edge case)
                return data as unknown as T;
            }

            // Check for compression wrapper
            if (parsed && typeof parsed === 'object' && parsed._c === true && typeof parsed.d === 'string') {
                try {
                    const buffer = Buffer.from(parsed.d, 'base64');
                    const decompressed = await gunzipAsync(buffer);
                    return JSON.parse(decompressed.toString()) as T;
                } catch (err) {
                    logger.error({ err, key }, 'Failed to decompress cache value');
                    return null; // Treat as miss on corruption
                }
            }

            logger.debug({ key }, 'AI Cache HIT');
            return parsed as T;
        } catch (error) {
            logger.warn({ error, key }, 'AI Cache get failed');
            return null;
        } finally {
            timer();
        }
    }

    /**
     * Set cached value with TTL
     */
    async set<T>(key: string, value: T, ttl: number = this.defaultTTL): Promise<void> {
        const timer = cacheLatency.startTimer({ operation: 'set' });
        try {
            const client = await dragonfly.getClient();
            const jsonString = JSON.stringify(value);
            const originalSize = Buffer.byteLength(jsonString);

            let dataToStore = jsonString;

            // Compress if large enough
            if (originalSize > this.COMPRESSION_THRESHOLD) {
                const compressedBuffer = await gzipAsync(Buffer.from(jsonString));
                if (compressedBuffer.length < originalSize) {
                    const wrapper: CompressedValue = {
                        _c: true,
                        d: compressedBuffer.toString('base64')
                    };
                    dataToStore = JSON.stringify(wrapper);

                    const saved = originalSize - compressedBuffer.length;
                    cacheCompressionSavings.inc(saved);

                    logger.debug({ key, originalSize, compressedSize: compressedBuffer.length }, 'Cache entry compressed');
                }
            }

            await client.setex(this.prefix + key, ttl, dataToStore);
        } catch (error) {
            logger.warn({ error, key }, 'AI Cache set failed');
        } finally {
            timer();
        }
    }

    /**
     * Delete cached value
     */
    async delete(key: string): Promise<void> {
        const timer = cacheLatency.startTimer({ operation: 'delete' });
        try {
            const client = await dragonfly.getClient();
            await client.del(this.prefix + key);
        } catch (error) {
            logger.warn({ error, key }, 'AI Cache delete failed');
        } finally {
            timer();
        }
    }

    /**
     * Generate deterministic cache key from prompt and options
     */
    generateKey(prompt: string, options: LLMOptions, provider: string): string {
        const data = JSON.stringify({
            prompt: prompt.substring(0, 2000), // Limit for key generation
            model: options.model,
            temperature: options.temperature,
            provider,
        });
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{ totalKeys: number; memoryUsage: number }> {
        try {
            const client = await dragonfly.getClient();
            const keys = await client.keys(this.prefix + '*');

            const info = await client.info('memory');
            const memoryMatch = info.match(/used_memory:(\d+)/);
            const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

            return {
                totalKeys: keys.length,
                memoryUsage,
            };
        } catch (error) {
            logger.warn({ error }, 'Failed to get AI cache stats');
            return { totalKeys: 0, memoryUsage: 0 };
        }
    }

    /**
     * Clear all AI cache entries
     */
    async clear(): Promise<void> {
        try {
            const client = await dragonfly.getClient();
            const keys = await client.keys(this.prefix + '*');

            if (keys.length > 0) {
                await client.del(...keys);
                logger.info({ count: keys.length }, 'AI Cache cleared');
            }
        } catch (error) {
            logger.warn({ error }, 'AI Cache clear failed');
        }
    }

    /**
     * Get cache entry with metadata
     */
    async getWithMetadata<T>(key: string): Promise<{ value: T; ttl: number } | null> {
        try {
            const client = await dragonfly.getClient();
            const fullKey = this.prefix + key;
            const [data, ttl] = await Promise.all([
                client.get(fullKey),
                client.ttl(fullKey)
            ]);

            if (!data) return null;

            let parsed = JSON.parse(data);

            // Handle compression in metadata fetch too
            if (parsed && typeof parsed === 'object' && parsed._c === true) {
                const buffer = Buffer.from(parsed.d, 'base64');
                const decompressed = await gunzipAsync(buffer);
                parsed = JSON.parse(decompressed.toString());
            }

            return {
                value: parsed as T,
                ttl: ttl > 0 ? ttl : 0
            };
        } catch (error) {
            return null;
        }
    }
}

let cacheInstance: AICache | null = null;

export function getAICache(): AICache {
    if (!cacheInstance) {
        cacheInstance = new AICache();
    }
    return cacheInstance;
}
