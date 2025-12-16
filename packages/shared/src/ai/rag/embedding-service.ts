import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { getAICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

export class EmbeddingService {
    private openai: OpenAI | null = null;
    private gemini: GoogleGenerativeAI | null = null;
    private cache = getAICache();
    private readonly CACHE_TTL = 2592000; // 30 days

    // Configuration
    private activeProvider: 'openai' | 'gemini' | 'generic' = 'openai';
    private model: string = 'text-embedding-3-small';

    constructor() {
        this.initializeConfig();
    }

    private initializeConfig() {
        if (process.env.GENERIC_EMBEDDING_BASE_URL) {
            this.activeProvider = 'generic';
            this.model = process.env.GENERIC_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';
            logger.info('🧠 Embedding Service: Using Generic Provider');
        } else if (process.env.GEMINI_API_KEY) {
            // Optional: Prefer Gemini if configured and no generic? 
            // Defaulting to OpenAI usually, but let's stick to env or default.
            // For now, let's keep OpenAI as primary default fallback.
        }
    }

    private async getClient(): Promise<any> {
        if (this.activeProvider === 'generic') {
            if (!this.openai) {
                this.openai = new OpenAI({
                    baseURL: process.env.GENERIC_EMBEDDING_BASE_URL,
                    apiKey: process.env.GENERIC_EMBEDDING_API_KEY || process.env.GENERIC_LLM_API_KEY || 'dummy-key',
                });
            }
            return { client: this.openai, type: 'openai-compatible' };
        }

        // Check for Gemini Request
        // If we want to support switching providers dynamically, we need execution options.
        // For now, using standard logic: Try OpenAI, else fail.

        // Hardcoded preference for now: OpenAI -> Gemini
        const openaiKey = await externalKeyManager.getKey('openai');
        if (openaiKey) {
            if (!this.openai) this.openai = new OpenAI({ apiKey: openaiKey.value });
            logger.info('🧠 Embedding Service: Using OpenAI Provider');
            return { client: this.openai, type: 'openai' };
        }

        const geminiKey = await externalKeyManager.getKey('gemini');
        if (geminiKey) {
            if (!this.gemini) this.gemini = new GoogleGenerativeAI(geminiKey.value);
            logger.info('🧠 Embedding Service: Using Gemini Provider');
            return { client: this.gemini, type: 'gemini' };
        }

        logger.warn('No embedding provider configured (OpenAI, Gemini, or Generic)');
        return null;
    }

    /**
     * Generate embedding for a single text string
     */
    async embedText(text: string): Promise<number[] | null> {
        try {
            const cleanText = text.replace(/\n/g, ' ').trim();
            if (!cleanText) return null;

            const cacheKey = this.getCacheKey(cleanText);
            const cached = await this.cache.get<number[]>(cacheKey);
            if (cached) return cached;

            const provider = await this.getClient();
            if (!provider) return null;

            let embedding: number[];

            if (provider.type === 'gemini') {
                const model = provider.client.getGenerativeModel({ model: 'text-embedding-004' });
                const result = await model.embedContent(cleanText);
                embedding = result.embedding.values;
            } else {
                // OpenAI or Generic
                const response = await provider.client.embeddings.create({
                    model: this.model,
                    input: cleanText,
                    encoding_format: 'float'
                });
                embedding = response.data[0].embedding;
            }

            await this.cache.set(cacheKey, embedding, this.CACHE_TTL);
            return embedding;

        } catch (error: any) {
            logger.error({ error }, 'Failed to generate embedding');
            return null;
        }
    }

    /**
     * Generate embeddings for multiple texts (Optimized with caching)
     */
    async embedBatch(texts: string[]): Promise<number[][] | null> {
        try {
            const cleanTexts = texts.map(t => t.replace(/\n/g, ' ').trim()).filter(t => t.length > 0);
            if (cleanTexts.length === 0) return null;

            const results: number[][] = new Array(cleanTexts.length);
            const missingIndices: number[] = [];
            const missingTexts: string[] = [];

            // Check cache for all
            for (let i = 0; i < cleanTexts.length; i++) {
                const cacheKey = this.getCacheKey(cleanTexts[i]);
                const cached = await this.cache.get<number[]>(cacheKey);
                if (cached) {
                    results[i] = cached;
                } else {
                    missingIndices.push(i);
                    missingTexts.push(cleanTexts[i]);
                }
            }

            // Fetch missing
            if (missingTexts.length > 0) {
                const provider = await this.getClient();
                if (!provider) return null; // Partial failure? Return what we have? No, return null for consistency.

                if (provider.type === 'gemini') {
                    // Gemini batching is different (embedContent doesn't take array natively in same way? 
                    // actually batchEmbedContents exists but slightly different).
                    // Iterating for now for safety as it's a fallback.
                    const model = provider.client.getGenerativeModel({ model: 'text-embedding-004' });
                    for (let i = 0; i < missingTexts.length; i++) {
                        const result = await model.embedContent(missingTexts[i]);
                        const embedding = result.embedding.values;

                        const originalIndex = missingIndices[i];
                        results[originalIndex] = embedding;

                        await this.cache.set(this.getCacheKey(missingTexts[i]), embedding, this.CACHE_TTL);
                    }
                } else {
                    // OpenAI
                    const response = await provider.client.embeddings.create({
                        model: this.model,
                        input: missingTexts,
                        encoding_format: 'float'
                    });

                    for (let i = 0; i < response.data.length; i++) {
                        const embedding = response.data[i].embedding;
                        const originalIndex = missingIndices[i];
                        results[originalIndex] = embedding;
                        await this.cache.set(this.getCacheKey(missingTexts[i]), embedding, this.CACHE_TTL);
                    }
                }
            }

            return results;
        } catch (error: any) {
            logger.error({ error }, 'Failed to generate batch embeddings');
            return null;
        }
    }

    private getCacheKey(text: string): string {
        const hash = crypto.createHash('md5').update(text).digest('hex');
        return `embedding:${hash}`;
    }
}

/**
 * Factory function to create EmbeddingService instance
 */
export function createEmbeddingService(): EmbeddingService {
    return new EmbeddingService();
}

/**
 * @deprecated Use createEmbeddingService() or inject via DI container
 */
export const embeddingService = createEmbeddingService();
