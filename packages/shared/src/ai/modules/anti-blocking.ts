import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { AntiBlocking, AntiBlockingSchema } from '../schemas/ai-outputs.schema.js';
import { ANTI_BLOCKING_SYSTEM_PROMPT, ANTI_BLOCKING_USER_PROMPT } from '../prompts/all-prompts.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Anti-Blocking Module - Detects and counters bot detection systems
 */
export interface AntiBlockingInput {
    url: string;
    html: string;
    statusCode?: number;
    headers?: Record<string, string>;
}

export class AntiBlockingModule implements IAIModule<AntiBlockingInput, AntiBlocking, AIModuleOptions> {
    readonly name = 'anti-blocking';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: AntiBlockingInput, options?: AIModuleOptions): Promise<AIModuleResult<AntiBlocking>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<AntiBlocking>(cacheKey);
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
            const systemPrompt = `You are an expert in Web Scraping Evasion.
Analyze the HTML and suggested if the page is blocking automated access (WAF, Captcha, 403).
Return a classification and suggested evasion technique.`;

            const userPrompt = `
Analyze this page content:
URL: ${input.url}
HTML Snippet:
${input.html?.substring(0, 2000) || 'No HTML provided'}
`;

            const llmData = await llm.generateJSON<AntiBlocking>(
                userPrompt,
                AntiBlockingSchema,
                {
                    systemPrompt,
                    temperature: options?.temperature || 0.3,
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
                    confidence: llmData.confidence,
                },
            };
        } catch (error: any) {
            logger.error({ error, url: input.url }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: AntiBlockingInput): Promise<boolean> {
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
            const providers = this.llmManager.getAvailableProviders();
            return providers.length > 0;
        } catch {
            return false;
        }
    }

    private getCacheKey(input: AntiBlockingInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.url);
        hash.update(input.html.substring(0, 3000));
        hash.update(String(input.statusCode || 200));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
