import { vectorStore, VectorStore } from './vector-store.js';
import { embeddingService } from './embedding-service.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

export interface ScrapedContent {
    url: string;
    title?: string;
    content: string; // The raw text or serialized JSON to embed
    type: 'job' | 'product' | 'article' | 'other';
    metadata?: Record<string, any>;
}

export interface ScrapingStrategy {
    urlPattern: string;
    domain: string;
    selectors: Record<string, string>; // e.g. { "title": ".job-title", ... }
    successRate: number;
    lastUpdated: number;
}

/**
 * Knowledge Base - High-level RAG operations
 * Manages storage and retrieval of both "Content" (what we scraped) and "Strategies" (how we scraped it)
 */
export class KnowledgeBase {
    private store: VectorStore;

    constructor() {
        this.store = vectorStore;
    }

    /**
     * Ingest structured content into the Knowledge Base
     * This enables "Semantic Search" over scraped data
     */
    async ingestContent(item: ScrapedContent): Promise<string> {
        try {
            // 1. Generate Embedding
            const embedding = await embeddingService.embedText(item.content);
            if (!embedding) throw new Error('Failed to generate embedding for content');

            // 2. Store in Vector DB
            const id = await this.store.addDocument(
                item.content,
                embedding,
                {
                    url: item.url,
                    title: item.title,
                    type: item.type,
                    ...item.metadata
                }
            );

            logger.info({ id, url: item.url, type: item.type }, '📚 KnowledgeBase: Content ingested');
            return id;
        } catch (error) {
            logger.error({ error, url: item.url }, 'Failed to ingest content into KnowledgeBase');
            throw error;
        }
    }

    /**
     * Search for similar content (Semantic Search)
     */
    async searchContent(query: string, limit: number = 5) {
        try {
            const embedding = await embeddingService.embedText(query);
            if (!embedding) return [];
            return await this.store.search(embedding, limit);
        } catch (error) {
            logger.error({ error, query }, 'Content search failed');
            return [];
        }
    }

    /**
     * Learn a scraping strategy
     * Stores "Visual Layout Fingerprint" -> "Selectors"
     * For now, we reuse the text embedding of the HTML structure/snippet as the fingerprint
     */
    async learnStrategy(strategy: ScrapingStrategy, htmlSnippet: string): Promise<string> {
        try {
            // Fingerprint: We ideally want an embedding of the DOM structure, not just text.
            // For this MVP, we'll embed the first 1000 chars of HTML structure or text representation.
            const plantingSnippet = htmlSnippet.substring(0, 2000);
            const embedding = await embeddingService.embedText(plantingSnippet);
            if (!embedding) throw new Error('Failed to generate embedding for strategy');

            const id = await this.store.addDocument(
                JSON.stringify(strategy.selectors), // Store selectors as the "document" text
                embedding,
                {
                    type: 'strategy',
                    domain: strategy.domain,
                    urlPattern: strategy.urlPattern,
                    successRate: strategy.successRate,
                    lastUpdated: strategy.lastUpdated
                }
            );

            logger.info({ domain: strategy.domain }, '🎓 KnowledgeBase: Learned new scraping strategy');
            return id;
        } catch (error) {
            logger.error({ error, domain: strategy.domain }, 'Failed to learn strategy');
            throw error;
        }
    }

    /**
     * Recall a strategy for a given page structure
     */
    async recallStrategy(htmlSnippet: string, domain?: string): Promise<ScrapingStrategy | null> {
        try {
            const plantingSnippet = htmlSnippet.substring(0, 2000);
            const embedding = await embeddingService.embedText(plantingSnippet);
            if (!embedding) return null;

            const results = await this.store.search(embedding, 3);

            // Filter by domain match if provided (strict) or rely on semantic similarly (adaptive)
            // For now, let's look for the best semantic match that is either generic or same-domain
            const bestMatch = results.find(r => r.score > 0.85); // High confidence threshold

            if (bestMatch) {
                logger.info({ score: bestMatch.score }, '💡 KnowledgeBase: Recalled scraping strategy');
                return {
                    selectors: JSON.parse(bestMatch.doc.text),
                    domain: bestMatch.doc.metadata.domain,
                    urlPattern: bestMatch.doc.metadata.urlPattern,
                    successRate: bestMatch.doc.metadata.successRate,
                    lastUpdated: bestMatch.doc.metadata.lastUpdated
                };
            }

            return null;
        } catch (error) {
            logger.warn({ error }, 'Failed to recall strategy');
            return null;
        }
    }
}

export const knowledgeBase = new KnowledgeBase();
