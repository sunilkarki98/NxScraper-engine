import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { AIStrategy, AIStrategySchema } from '../schemas/ai-outputs.schema.js';
import { STRATEGY_PLANNING_SYSTEM_PROMPT, STRATEGY_PLANNING_USER_PROMPT } from '../prompts/all-prompts.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Strategy Planning Module - Recommends optimal scraping approaches
 */
export interface StrategyPlanningInput {
    url: string;
    pageUnderstanding: any;
    previousAttempts?: any[];
}

export class StrategyPlanningModule implements IAIModule<StrategyPlanningInput, AIStrategy, AIModuleOptions> {
    readonly name = 'strategy-planning';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: StrategyPlanningInput, options?: AIModuleOptions): Promise<AIModuleResult<AIStrategy>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<AIStrategy>(cacheKey);
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
            const systemPrompt = STRATEGY_PLANNING_SYSTEM_PROMPT;
            const userPrompt = STRATEGY_PLANNING_USER_PROMPT(input.url, input.pageUnderstanding, input.previousAttempts);

            const llmData = await llm.generateJSON<AIStrategy>(
                userPrompt,
                AIStrategySchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.3,
                    model: options?.model,
                }
            );

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

    async validate(input: StrategyPlanningInput): Promise<boolean> {
        if (!input.url || typeof input.url !== 'string') {
            throw new Error('Invalid input: url is required and must be a string');
        }
        if (!input.pageUnderstanding) {
            throw new Error('Invalid input: pageUnderstanding is required');
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

    private getCacheKey(input: StrategyPlanningInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.url);
        hash.update(JSON.stringify(input.pageUnderstanding));
        hash.update(JSON.stringify(input.previousAttempts || []));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
