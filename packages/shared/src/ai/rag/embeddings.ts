import { EmbeddingFunction } from 'chromadb';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import logger from '../../utils/logger.js';

export class GeminiEmbeddingFunction implements EmbeddingFunction {
    private client: GoogleGenerativeAI | null = null;
    private readonly modelName = 'text-embedding-004';

    async generate(texts: string[]): Promise<number[][]> {
        try {
            const client = await this.getClient();
            const model = client.getGenerativeModel({ model: this.modelName });

            const embeddings: number[][] = [];

            for (const text of texts) {
                const result = await model.embedContent(text);
                const embedding = result.embedding.values;
                embeddings.push(embedding);
            }

            return embeddings;

        } catch (error) {
            logger.error({ error }, 'Failed to generate embeddings with Gemini');
            // Fallback to zero vector or throw? throwing is safer for now to alert config issues
            throw error;
        }
    }

    private async getClient(): Promise<GoogleGenerativeAI> {
        if (this.client) return this.client;

        const key = await externalKeyManager.getKey('gemini');
        if (!key) {
            throw new Error('No Gemini API key available for embeddings');
        }

        this.client = new GoogleGenerativeAI(key.value);
        return this.client;
    }
}
