import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { AISchemaOutput, AISchemaOutputSchema } from '../schemas/ai-outputs.schema.js';
import { SCHEMA_INFERENCE_SYSTEM_PROMPT, SCHEMA_INFERENCE_USER_PROMPT } from '../prompts/all-prompts.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Schema Inference Module - Maps extracted data to Schema.org types
 */
export interface SchemaInferenceInput {
    pageUnderstanding: any;
    extractedFields: Record<string, any>;
}

export class SchemaInferenceModule implements IAIModule<SchemaInferenceInput, AISchemaOutput, AIModuleOptions> {
    readonly name = 'schema-inference';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: SchemaInferenceInput, options?: AIModuleOptions): Promise<AIModuleResult<AISchemaOutput>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<AISchemaOutput>(cacheKey);
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

            const llm = this.llmManager.getProvider(options?.provider);
            const systemPrompt = SCHEMA_INFERENCE_SYSTEM_PROMPT;
            const userPrompt = SCHEMA_INFERENCE_USER_PROMPT(input.pageUnderstanding, input.extractedFields);

            const llmData = await llm.generateJSON<AISchemaOutput>(
                userPrompt,
                AISchemaOutputSchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.2,
                    model: options?.model,
                }
            );

            if (useCache) {
                const ttl = options?.cacheTTL || 7200; // 2 hours default
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
            logger.error({ error }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: SchemaInferenceInput): Promise<boolean> {
        if (!input.pageUnderstanding) {
            throw new Error('Invalid input: pageUnderstanding is required');
        }
        if (!input.extractedFields || typeof input.extractedFields !== 'object') {
            throw new Error('Invalid input: extractedFields is required and must be an object');
        }
        return true;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const providers = this.llmManager.getAvailableProviders();
            return providers.length > 0;
        } catch {
            return false;
        }
    }

    private getCacheKey(input: SchemaInferenceInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(input.pageUnderstanding));
        hash.update(JSON.stringify(input.extractedFields));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
