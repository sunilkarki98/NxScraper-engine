import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { Validation, ValidationSchema } from '../schemas/ai-outputs.schema.js';
import { DATA_VALIDATION_SYSTEM_PROMPT, DATA_VALIDATION_USER_PROMPT } from '../prompts/all-prompts.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Data Validation Module - Validates and repairs extracted data
 */
export interface DataValidationInput {
    schema: any;
    extractedData: any[];
    selectors?: Record<string, unknown>;
}

export class DataValidationModule implements IAIModule<DataValidationInput, Validation, AIModuleOptions> {
    readonly name = 'data-validation';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: DataValidationInput, options?: AIModuleOptions): Promise<AIModuleResult<Validation>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<Validation>(cacheKey);
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
            const systemPrompt = DATA_VALIDATION_SYSTEM_PROMPT;
            const userPrompt = DATA_VALIDATION_USER_PROMPT(
                input.schema,
                input.extractedData,
                input.selectors
            );

            const llmData = await llm.generateJSON<Validation>(
                userPrompt,
                ValidationSchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.2,
                    model: options?.model,
                }
            );

            if (useCache) {
                const ttl = options?.cacheTTL || 1800; // 30 minutes default
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
                    confidence: llmData.overall.confidenceScore / 100,
                },
            };
        } catch (error: any) {
            logger.error({ error }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: DataValidationInput): Promise<boolean> {
        if (!input.schema) {
            throw new Error('Invalid input: schema is required');
        }
        if (!input.extractedData || !Array.isArray(input.extractedData)) {
            throw new Error('Invalid input: extractedData is required and must be an array');
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

    private getCacheKey(input: DataValidationInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(JSON.stringify(input.schema));
        hash.update(JSON.stringify(input.extractedData));
        hash.update(JSON.stringify(input.selectors || []));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
