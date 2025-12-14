import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { AISelector, AISelectorSchema } from '../schemas/ai-outputs.schema.js';
import { SELECTOR_GENERATION_SYSTEM_PROMPT, SELECTOR_GENERATION_USER_PROMPT } from '../prompts/all-prompts.js';
import { healingManager } from '../healing/healing-manager.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import { URL } from 'url';

/**
 * Selector Generation Module - Creates robust CSS/XPath selectors with fallbacks
 */
export interface SelectorGenerationInput {
    html: string;
    fieldName: string;
    context?: string;
    url?: string; // Added for healing support
}

export class SelectorGenerationModule implements IAIModule<SelectorGenerationInput, AISelector, AIModuleOptions> {
    readonly name = 'selector-generation';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: SelectorGenerationInput, options?: AIModuleOptions): Promise<AIModuleResult<AISelector>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            // 1. Check Healing Manager first (Proactive Healing)
            if (input.url) {
                try {
                    const domain = new URL(input.url).hostname;
                    const healedSelectors = await healingManager.getSelectors(domain, input.fieldName);

                    if (healedSelectors.length > 0) {
                        const best = healedSelectors[0];
                        logger.info({ domain, field: input.fieldName, score: best.score }, 'Using healed selector');

                        return {
                            data: best.selector,
                            metadata: {
                                module: this.name,
                                provider: 'healing-manager',
                                model: 'healing',
                                executionTime: Date.now() - startTime,
                                cached: true,
                                confidence: best.score,
                                healingId: best.id // Return ID for feedback loop
                            }
                        };
                    }
                } catch (err) {
                    logger.warn({ err }, 'Failed to check healing manager');
                }
            }

            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<AISelector>(cacheKey);
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
            const systemPrompt = SELECTOR_GENERATION_SYSTEM_PROMPT;
            const userPrompt = SELECTOR_GENERATION_USER_PROMPT(input.html, input.fieldName, undefined, input.context);

            const llmData = await llm.generateJSON<AISelector>(
                userPrompt,
                AISelectorSchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.2,
                    model: options?.model,
                }
            );

            let healingId: string | undefined;

            // Save to Healing Manager
            if (input.url) {
                try {
                    const domain = new URL(input.url).hostname;
                    // Only save if confidence is high enough
                    if (llmData.primary.confidence > 0.7) {
                        healingId = await healingManager.saveSelector(domain, input.fieldName, llmData);
                    }
                } catch (err) {
                    logger.warn({ err }, 'Failed to save to healing manager');
                }
            }

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
                    confidence: llmData.primary.confidence,
                    healingId // Return new ID for feedback loop
                },
            };
        } catch (error: any) {
            logger.error({ error, fieldName: input.fieldName }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: SelectorGenerationInput): Promise<boolean> {
        if (!input.html || typeof input.html !== 'string') {
            throw new Error('Invalid input: html is required and must be a string');
        }
        if (!input.fieldName || typeof input.fieldName !== 'string') {
            throw new Error('Invalid input: fieldName is required and must be a string');
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

    private getCacheKey(input: SelectorGenerationInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.html.substring(0, 3000));
        hash.update(input.fieldName);
        hash.update(input.context || '');
        return `${this.name}:${hash.digest('hex')}`;
    }
}
