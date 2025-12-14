import { z } from 'zod';
import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { LoginErrorType } from '../../types/auth-errors.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Error Classification Schema
 */
export const ErrorClassificationSchema = z.object({
    errorType: z.enum([
        'BAD_CREDENTIALS',
        'RATE_LIMITED',
        'CAPTCHA_FAILED',
        'TIMEOUT',
        'ACCOUNT_LOCKED',
        'TWO_FACTOR_REQUIRED',
        'UNKNOWN'
    ]),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
    suggestedAction: z.enum([
        'retry_immediately',
        'wait_short',      // 5-10s
        'wait_medium',     // 30-60s
        'wait_long',       // 5+ minutes
        'change_identity', // New fingerprint
        'abort'
    ]),
    retryDelayMs: z.number().optional()
});

export type ErrorClassification = z.infer<typeof ErrorClassificationSchema>;

/**
 * Input for error classification
 */
export interface ErrorClassificationInput {
    pageUrl: string;
    pageContent: string;
    screenshot?: Buffer; // Optional for vision-enhanced analysis
}

/**
 * AI-Powered Error Classifier
 * Uses LLM to intelligently classify login errors with context awareness
 */
export class AuthErrorClassifier implements IAIModule<ErrorClassificationInput, ErrorClassification, AIModuleOptions> {
    readonly name = 'auth-error-classifier';

    private readonly SYSTEM_PROMPT = `You are an expert at analyzing web authentication failures.
Your task is to classify login errors based on page content and URL.

Classification Guidelines:
- BAD_CREDENTIALS: Wrong username/password, "incorrect", "invalid", "wrong password"
- RATE_LIMITED: "too many attempts", "rate limit", "temporarily blocked", "try again later"
- CAPTCHA_FAILED: "captcha", "verify you are human", "robot detection"
- TIMEOUT: Navigation timeout, server errors (500, 502, 503, 504)
- ACCOUNT_LOCKED: "account locked", "suspended", "disabled", "banned"
- TWO_FACTOR_REQUIRED: "2fa", "two-factor", "verification code", "authenticator"
- UNKNOWN: Cannot determine from available information

Be context-aware:
- Consider URL patterns (e.g., /error, /blocked, /verify)
- Language-agnostic (detect errors in any language)
- Look for HTTP status codes in content
- Consider timing indicators ("wait 5 minutes", "try in 1 hour")

Provide confidence score (0-1) and clear reasoning.`;

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: ErrorClassificationInput, options?: AIModuleOptions): Promise<AIModuleResult<ErrorClassification>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            // Check cache first
            const useCache = options?.useCache !== false;
            const cacheKey = this.getCacheKey(input);

            if (useCache) {
                const cached = await this.cache.get<ErrorClassification>(cacheKey);
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

            // Prepare prompt
            const userPrompt = this.buildUserPrompt(input);

            // Select LLM provider (prefer fast, cheap models)
            const provider = options?.provider || 'gemini-flash';
            const llm = this.llmManager.getProvider(provider);

            // Generate classification
            const classification = await llm.generateJSON<ErrorClassification>(
                userPrompt,
                ErrorClassificationSchema,
                {
                    systemPrompt: this.SYSTEM_PROMPT,
                    temperature: 0.1, // Low temperature for consistent classification
                    model: options?.model,
                }
            );

            // Auto-calculate retry delay based on action
            if (!classification.retryDelayMs) {
                classification.retryDelayMs = this.calculateRetryDelay(classification);
            }

            // Cache result
            if (useCache) {
                const ttl = options?.cacheTTL || 300; // 5 minutes (errors change less frequently)
                await this.cache.set(cacheKey, classification, ttl);
            }

            return {
                data: classification,
                metadata: {
                    module: this.name,
                    provider: llm.name,
                    model: options?.model || 'default',
                    executionTime: Date.now() - startTime,
                    cached: false,
                },
            };
        } catch (error: any) {
            logger.error({ error, url: input.pageUrl }, `${this.name} execution failed`);

            // Fallback to keyword-based detection
            return this.fallbackClassification(input, startTime);
        }
    }

    async validate(input: ErrorClassificationInput): Promise<boolean> {
        if (!input.pageUrl || typeof input.pageUrl !== 'string') {
            throw new Error('Invalid input: pageUrl is required');
        }
        if (!input.pageContent || typeof input.pageContent !== 'string') {
            throw new Error('Invalid input: pageContent is required');
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

    private buildUserPrompt(input: ErrorClassificationInput): string {
        // Truncate content to avoid token limits (keep first 2000 chars)
        const content = input.pageContent.substring(0, 2000);

        return `Analyze this login failure:

URL: ${input.pageUrl}

Page Content (truncated):
${content}

Classify the error type and provide:
1. errorType (one of the types listed)
2. confidence (0-1, how certain you are)
3. reason (brief explanation of what you observed)
4. suggestedAction (what should be done next)`;
    }

    private calculateRetryDelay(classification: ErrorClassification): number {
        const delays = {
            retry_immediately: 0,
            wait_short: 5000,
            wait_medium: 30000,
            wait_long: 300000,
            change_identity: 10000,
            abort: 0
        };
        return delays[classification.suggestedAction];
    }

    private fallbackClassification(
        input: ErrorClassificationInput,
        startTime: number
    ): AIModuleResult<ErrorClassification> {
        logger.warn('Using fallback keyword-based classification');

        const content = input.pageContent.toLowerCase();
        let errorType: LoginErrorType = LoginErrorType.UNKNOWN;
        let suggestedAction: ErrorClassification['suggestedAction'] = 'retry_immediately';

        // Simple keyword matching as fallback
        if (content.includes('rate limit') || content.includes('too many')) {
            errorType = LoginErrorType.RATE_LIMITED;
            suggestedAction = 'wait_medium';
        } else if (content.includes('incorrect') || content.includes('invalid') || content.includes('wrong')) {
            errorType = LoginErrorType.BAD_CREDENTIALS;
            suggestedAction = 'abort';
        } else if (content.includes('captcha') || content.includes('verify')) {
            errorType = LoginErrorType.CAPTCHA_FAILED;
            suggestedAction = 'wait_short';
        } else if (content.includes('locked') || content.includes('suspended')) {
            errorType = LoginErrorType.ACCOUNT_LOCKED;
            suggestedAction = 'abort';
        } else if (content.includes('2fa') || content.includes('two-factor')) {
            errorType = LoginErrorType.TWO_FACTOR_REQUIRED;
            suggestedAction = 'abort';
        }

        return {
            data: {
                errorType: errorType as any,
                confidence: 0.5,
                reason: 'Fallback keyword-based detection (LLM unavailable)',
                suggestedAction,
                retryDelayMs: this.calculateRetryDelay({ suggestedAction } as any)
            },
            metadata: {
                module: this.name,
                provider: 'fallback',
                model: 'keyword-matcher',
                executionTime: Date.now() - startTime,
                cached: false,
            },
        };
    }

    private getCacheKey(input: ErrorClassificationInput): string {
        const hash = crypto.createHash('sha256');
        hash.update(input.pageUrl);
        hash.update(input.pageContent.substring(0, 1000));
        return `${this.name}:${hash.digest('hex')}`;
    }
}
