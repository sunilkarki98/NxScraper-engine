import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { PageUnderstanding, PageUnderstandingSchema } from '../schemas/ai-outputs.schema.js';
import { PAGE_UNDERSTANDING_SYSTEM_PROMPT, PAGE_UNDERSTANDING_USER_PROMPT } from '../prompts/page-understanding.prompt.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Page Understanding Module - Analyzes HTML to identify page structure and entities
 */
export interface PageUnderstandingInput {
    url: string;
    html: string;
}

export class PageUnderstandingModule implements IAIModule<PageUnderstandingInput, PageUnderstanding, AIModuleOptions> {
    readonly name = 'page-understanding';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: PageUnderstandingInput, options?: AIModuleOptions): Promise<AIModuleResult<PageUnderstanding>> {
        const startTime = Date.now();

        try {
            // Validate input
            await this.validate(input);

            // Check cache
            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<PageUnderstanding>(cacheKey);
                if (cached) {
                    logger.debug(`Cache hit for ${this.name}`);
                    return {
                        data: cached,
                        metadata: {
                            module: this.name,
                            provider: 'cache',
                            model: 'cache',
                            executionTime: Date.now() - startTime,
                            cached: true,
                        },
                    };
                }
            }

            // Get LLM provider
            const llm = this.llmManager.getProvider(options?.provider);
            const systemPrompt = PAGE_UNDERSTANDING_SYSTEM_PROMPT;
            const userPrompt = PAGE_UNDERSTANDING_USER_PROMPT(input.url, input.html);

            // Generate analysis
            const llmData = await llm.generateJSON<PageUnderstanding>(
                userPrompt,
                PageUnderstandingSchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.3,
                    model: options?.model,
                }
            );

            // Cache result
            if (useCache) {
                const ttl = options?.cacheTTL || 3600; // 1 hour default
                await this.cache.set(cacheKey, llmData, ttl);
            }

            return {
                data: llmData,
                metadata: {
                    module: this.name,
                    provider: llm.name,
                    model: options?.model || 'default',
                    executionTime: Date.now() - startTime,
                    cached: false,
                    confidence: llmData.confidence,
                },
            };
        } catch (error: any) {
            logger.error({ error, url: input.url }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: PageUnderstandingInput): Promise<boolean> {
        if (!input.url || typeof input.url !== 'string') {
            throw new Error('Invalid input: url is required and must be a string');
        }
        if (!input.html || typeof input.html !== 'string') {
            throw new Error('Invalid input: html is required and must be a string');
        }
        return true;
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Check if at least one LLM provider is available
            const providers = this.llmManager.getAvailableProviders();
            return providers.length > 0;
        } catch {
            return false;
        }
    }

    private getCacheKey(input: PageUnderstandingInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.url);
        hash.update(input.html.substring(0, 5000)); // Use first 5KB for cache key
        return `${this.name}:${hash.digest('hex')}`;
    }
}
