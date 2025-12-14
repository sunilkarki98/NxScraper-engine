import OpenAI from 'openai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { getAICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

export class EmbeddingService {
    private client: OpenAI | null = null;
    private cache = getAICache();
    private readonly CACHE_TTL = 2592000; // 30 days

    private async getClient(): Promise<OpenAI | null> {
        if (this.client) return this.client;

        const keyConfig = await externalKeyManager.getKey('openai');
        if (!keyConfig) {
            logger.warn('No OpenAI key available for embeddings');
            return null;
        }

        this.client = new OpenAI({ apiKey: keyConfig.value });
        return this.client;
    }

    /**
     * Generate embedding for a single text string
     */
    async embedText(text: string): Promise<number[] | null> {
        try {
            // Clean text
            const cleanText = text.replace(/\n/g, ' ').trim();
            if (!cleanText) return null;

            // Check cache
            const cacheKey = this.getCacheKey(cleanText);
            const cached = await this.cache.get<number[]>(cacheKey);

            if (cached) {
                return cached;
            }

            // Generate
            const openAI = await this.getClient();
            if (!openAI) return null;

            const response = await openAI.embeddings.create({
                model: 'text-embedding-3-small',
                input: cleanText,
                encoding_format: 'float'
            });

            const embedding = response.data[0].embedding;

            // Cache result
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

            // Fetch missing from OpenAI
            if (missingTexts.length > 0) {
                const openAI = await this.getClient();
                if (!openAI) return null;

                const response = await openAI.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: missingTexts,
                    encoding_format: 'float'
                });

                // Fill results and cache
                for (let i = 0; i < response.data.length; i++) {
                    const embedding = response.data[i].embedding;
                    const originalIndex = missingIndices[i];
                    results[originalIndex] = embedding;

                    const cacheKey = this.getCacheKey(missingTexts[i]);
                    await this.cache.set(cacheKey, embedding, this.CACHE_TTL);
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

export const embeddingService = new EmbeddingService();
