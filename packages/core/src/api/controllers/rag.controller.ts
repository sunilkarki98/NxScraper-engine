import { Request, Response } from 'express';
import { embeddingService } from '@nx-scraper/shared';
import { vectorStore } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class RAGController {
    /**
     * Index a document
     * POST /rag/index
     * Body: { text: string, metadata: object }
     */
    async indexDocument(req: Request, res: Response) {
        try {
            const { text, metadata } = req.body;

            if (!text) {
                return res.status(400).json({ error: 'text is required' });
            }

            // Generate embedding
            const embedding = await embeddingService.embedText(text);
            if (!embedding) {
                return res.status(500).json({ error: 'Failed to generate embedding' });
            }

            // Store in vector store
            const id = await vectorStore.addDocument(text, embedding, metadata);

            logger.info({ docId: id }, 'Indexed document for RAG');

            res.status(201).json({
                success: true,
                data: { id }
            });
        } catch (error) {
            logger.error({ error }, 'Failed to index document');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Query the knowledge base
     * POST /rag/query
     * Body: { query: string, limit: number }
     */
    async query(req: Request, res: Response) {
        try {
            const { query, limit = 3 } = req.body;

            if (!query) {
                return res.status(400).json({ error: 'query is required' });
            }

            // Generate query embedding
            const embedding = await embeddingService.embedText(query);
            if (!embedding) {
                return res.status(500).json({ error: 'Failed to generate query embedding' });
            }

            // Search vector store
            const results = await vectorStore.search(embedding, limit);

            res.json({
                success: true,
                data: results.map(r => ({
                    text: r.doc.text,
                    metadata: r.doc.metadata,
                    score: r.score,
                    createdAt: new Date(r.doc.createdAt).toISOString()
                }))
            });
        } catch (error) {
            logger.error({ error }, 'Failed to query RAG');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
