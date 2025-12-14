import { getAICache } from '../cache/ai-cache.js';
import { LLMManager } from '../llm/manager.js';
import logger from '../../utils/logger.js';
import { vectorStore } from '../rag/vector-store.js';
import { embeddingService } from '../rag/embedding-service.js';

export interface StrategyMemory {
    domain: string;
    successfulScraper: 'universal-scraper' | 'heavy-scraper' | 'google-scraper';
    actions: string[]; // Successful actions taken
    timestamp: number;
}

export class Memory {
    private cache = getAICache();
    private collectionName = 'scraping_strategies';

    constructor(private llmManager: LLMManager) { }

    /**
     * Recall successful strategy for a domain
     */
    async recallStrategy(domain: string): Promise<StrategyMemory | null> {
        // Simple key-value lookup for now, can be upgraded to vector search later
        const key = `strategy:${domain}`;
        const strategy = await this.cache.get<StrategyMemory>(key);

        if (strategy) {
            logger.info({ domain, strategy }, '🧠 Memory: Recalled successful strategy');
            return strategy;
        }

        return null;
    }

    /**
     * Memorize a successful strategy with Semantic Embedding
     */
    async memorizeStrategy(domain: string, scraper: 'universal-scraper' | 'heavy-scraper' | 'google-scraper', actions: string[] = []) {
        const key = `strategy:${domain}`;
        const memory: StrategyMemory = {
            domain,
            successfulScraper: scraper,
            actions,
            timestamp: Date.now()
        };

        // 1. Store in fast cache (Exact Match)
        await this.cache.set(key, memory, 30 * 24 * 60 * 60);

        // 2. Store in Vector DB (Semantic Match)
        try {
            const text = `Strategy for ${domain}: Used ${scraper}. Actions: ${actions.join(', ')}`;
            const embedding = await embeddingService.embedText(text);

            if (embedding) {
                await vectorStore.addDocument(text, embedding, {
                    domain,
                    scraper,
                    type: 'strategy'
                });
                logger.info({ domain }, '🧠 Memory: Memorized strategy in Vector DB');
            }
        } catch (error) {
            logger.error({ error }, 'Failed to store strategy in Vector DB');
        }

        logger.info({ domain }, '🧠 Memory: Memorized successful strategy');
    }

    /**
     * Find similar strategies using RAG (Semantic Search)
     */
    async findSimilarStrategies(description: string): Promise<StrategyMemory[]> {
        try {
            const embedding = await embeddingService.embedText(description);
            if (!embedding) return [];

            const results = await vectorStore.search(embedding, 3);

            return results.map(r => ({
                domain: r.doc.metadata.domain,
                successfulScraper: r.doc.metadata.scraper,
                actions: [], // We could store actions in metadata if needed
                timestamp: r.doc.createdAt
            }));
        } catch (error) {
            logger.error({ error }, 'Failed to find similar strategies');
            return [];
        }
    }
}
