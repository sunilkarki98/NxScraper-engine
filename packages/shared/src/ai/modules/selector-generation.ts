import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { AISelector, AISelectorSchema } from '../schemas/ai-outputs.schema.js';
import { SELECTOR_GENERATION_SYSTEM_PROMPT, SELECTOR_GENERATION_USER_PROMPT } from '../prompts/all-prompts.js';
import { healingManager } from '../healing/healing-manager.js';
import { VisionModule } from './vision.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';
import { URL } from 'url';

/**
 * Selector Generation Module - Creates robust CSS/XPath selectors
 * Supports Text-based LLM and Vision-based Fallback
 */
export interface SelectorGenerationInput {
    html: string;
    fieldName: string;
    context?: string;
    url?: string;
    screenshot?: string; // Base64
}

export class SelectorGenerationModule implements IAIModule<SelectorGenerationInput, AISelector, AIModuleOptions> {
    readonly name = 'selector-generation';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache,
        private visionModule: VisionModule
    ) { }

    async execute(input: SelectorGenerationInput, options?: AIModuleOptions): Promise<AIModuleResult<AISelector>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            // 1. Check Healing Manager first
            if (input.url) {
                try {
                    const domain = new URL(input.url).hostname;
                    const healedSelectors = await healingManager.getSelectors(domain, input.fieldName);

                    if (healedSelectors.length > 0) {
                        const best = healedSelectors[0];
                        return {
                            data: best.selector,
                            metadata: {
                                module: this.name,
                                provider: 'healing-manager',
                                model: 'healing',
                                executionTime: Date.now() - startTime,
                                cached: true,
                                confidence: best.score,
                                healingId: best.id
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
                if (cached) return {
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

            // 2. Try Standard Text-LLM Generation
            let llmData: AISelector;
            let provider = 'text-llm';
            let usedVision = false;

            try {
                const llm = this.llmManager.getProvider(options?.provider);
                const userPrompt = SELECTOR_GENERATION_USER_PROMPT(input.html, input.fieldName, undefined, input.context);

                llmData = await llm.generateJSON<AISelector>(
                    userPrompt,
                    AISelectorSchema,
                    {
                        systemPrompt: SELECTOR_GENERATION_SYSTEM_PROMPT,
                        temperature: 0.2,
                        model: options?.model,
                    }
                );
            } catch (textError) {
                logger.warn({ error: textError, field: input.fieldName }, 'Text-based selector generation failed. Attempting Vision Fallback...');

                // 3. Vision Fallback
                if (input.screenshot) {
                    try {
                        usedVision = true;
                        provider = 'vision-llm';
                        const visionPrompt = `Look at this screenshot. I need a robust CSS selector for the field "${input.fieldName}". Context: ${input.context || 'None'}. Return ONLY a JSON object: { "primary": { "css": "...", "xpath": "...", "confidence": 0.9 }, "alternatives": [] }`;

                        llmData = await this.visionModule.execute({
                            screenshot: input.screenshot,
                            prompt: visionPrompt,
                            format: 'json'
                        });

                        logger.info({ field: input.fieldName }, '👁️ Vision Fallback Successful');
                    } catch (visionError) {
                        throw new Error(`Vision fallback also failed: ${visionError}`);
                    }
                } else {
                    throw textError;
                }
            }

            // Save for active healing
            let healingId: string | undefined;
            if (input.url && llmData.primary.confidence > 0.7) {
                const domain = new URL(input.url).hostname;
                healingId = await healingManager.saveSelector(domain, input.fieldName, llmData);
            }

            if (useCache) {
                await this.cache.set(cacheKey, llmData, options?.cacheTTL || 7200);
            }

            return {
                data: llmData,
                metadata: {
                    module: this.name,
                    provider: provider,
                    model: usedVision ? 'vision' : (options?.model || 'default'),
                    executionTime: Date.now() - startTime,
                    cached: false,
                    confidence: llmData.primary.confidence,
                    healingId
                },
            };

        } catch (error: any) {
            logger.error({ error, fieldName: input.fieldName }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: SelectorGenerationInput): Promise<boolean> {
        if (!input.html || typeof input.html !== 'string') throw new Error('Invalid input: html required');
        if (!input.fieldName || typeof input.fieldName !== 'string') throw new Error('Invalid input: fieldName required');
        return true;
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }

    private getCacheKey(input: SelectorGenerationInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.html.substring(0, 3000));
        hash.update(input.fieldName);
        return `${this.name}:${hash.digest('hex')}`;
    }
}
