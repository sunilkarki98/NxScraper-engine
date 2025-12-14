import { ChromaClient, Collection } from 'chromadb';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import { GeminiEmbeddingFunction } from './embeddings.js';
import { env } from '../../utils/env-validator.js';

export interface VectorDocument {
    id: string;
    text: string;
    metadata: Record<string, any>;
    embedding: number[];
    createdAt: number;
}

export class VectorStore {
    private client: ChromaClient | null = null;
    private collection: Collection | null = null;
    private readonly collectionName = 'scraping_knowledge_base_v2';

    constructor() {
        // Initialization deferred until first use
    }

    private initClient() {
        if (this.client) return;

        // Use validated environment configuration (lazy access)
        const url = new URL(env.CHROMA_DB_URL);
        this.client = new ChromaClient({
            host: url.hostname,
            port: parseInt(url.port) || 8000
        });
    }

    /**
     * Initialize connection and collection
     */
    private async init() {
        this.initClient();
        if (this.collection) return;

        try {
            const embedder = new GeminiEmbeddingFunction();
            this.collection = await this.client!.getOrCreateCollection({
                name: this.collectionName,
                embeddingFunction: embedder,
                metadata: { bg_color: '#000000' }
            });
            logger.info('🧠 Vector Store: Connected to ChromaDB');
        } catch (error) {
            logger.error({ error }, 'Failed to connect to ChromaDB');
        }
    }

    /**
     * Add a document to the store
     */
    async addDocument(text: string, embedding: number[], metadata: Record<string, any> = {}): Promise<string> {
        if (!this.collection) await this.init();
        if (!this.collection) throw new Error('Vector Store not initialized');

        const id = crypto.randomUUID();
        const now = Date.now();

        await this.collection.add({
            ids: [id],
            embeddings: [embedding],
            metadatas: [{ ...metadata, createdAt: now, text }], // Store text in metadata for retrieval
            documents: [text]
        });

        logger.debug({ id }, 'Added document to vector store');
        return id;
    }

    /**
     * Search for similar documents
     */
    async search(queryEmbedding: number[], limit: number = 5): Promise<{ doc: VectorDocument; score: number }[]> {
        if (!this.collection) await this.init();
        if (!this.collection) throw new Error('Vector Store not initialized');

        const results = await this.collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: limit
        });

        const queryResults = results;
        const output: { doc: VectorDocument; score: number }[] = [];

        if (queryResults.ids.length > 0 && queryResults.ids[0]) {
            for (let i = 0; i < queryResults.ids[0].length; i++) {
                const id = queryResults.ids[0][i];
                const text = queryResults.documents?.[0]?.[i] || '';
                const metadata = queryResults.metadatas?.[0]?.[i] || {};
                const distance = queryResults.distances?.[0]?.[i] || 1;

                // Convert distance to similarity score
                const score = 1 / (1 + distance);

                output.push({
                    doc: {
                        id,
                        text,
                        metadata,
                        embedding: [], // Embeddings usually not returned unless requested
                        createdAt: (metadata.createdAt as number) || 0
                    },
                    score
                });
            }
        }

        return output;
    }
}

export const vectorStore = new VectorStore();
