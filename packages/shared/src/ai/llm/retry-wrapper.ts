import { LLMProvider, LLMOptions, LLMResponse, MessageContent } from './interfaces.js';
import { z } from 'zod';
import logger from '../../utils/logger.js';
import { LLMError, LLMRateLimitError } from '../../types/errors.js';

/**
 * LLM Cost Tracker - Track token usage and estimated costs across providers
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface CostEntry {
    provider: string;
    model: string;
    usage: TokenUsage;
    estimatedCost: number;
    timestamp: number;
}

// Pricing per 1M tokens (as of Dec 2024)
const PRICING: Record<string, Record<string, { input: number; output: number }>> = {
    openai: {
        'gpt-4o': { input: 2.50, output: 10.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4-turbo': { input: 10.00, output: 30.00 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    },
    anthropic: {
        'claude-3-5-sonnet-20240620': { input: 3.00, output: 15.00 },
        'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
        'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    },
    gemini: {
        'gemini-1.5-flash': { input: 0.075, output: 0.30 },
        'gemini-1.5-pro': { input: 1.25, output: 5.00 },
        'gemini-2.0-flash-exp': { input: 0.10, output: 0.40 },
    },
    deepseek: {
        'deepseek-chat': { input: 0.14, output: 0.28 }, // Cache miss pricing
        'deepseek-coder': { input: 0.14, output: 0.28 },
        'deepseek-reasoner': { input: 0.55, output: 2.19 },
    },
    openrouter: {
        // Common OpenRouter models (pricing varies by model)
        'openai/gpt-4o': { input: 2.50, output: 10.00 },
        'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
        'openai/gpt-3.5-turbo': { input: 0.50, output: 1.50 },
        'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
        'anthropic/claude-3-opus': { input: 15.00, output: 75.00 },
        'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
        'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
        'google/gemini-pro-1.5': { input: 1.25, output: 5.00 },
        'meta-llama/llama-3.1-70b-instruct': { input: 0.35, output: 0.40 },
        'meta-llama/llama-3.1-405b-instruct': { input: 2.70, output: 2.70 },
    },
};

class LLMCostTracker {
    private entries: CostEntry[] = [];
    private totalCost = 0;

    /**
     * Track token usage and calculate cost
     */
    track(provider: string, model: string, usage: TokenUsage): CostEntry {
        const pricing = PRICING[provider]?.[model] || { input: 0, output: 0 };

        const estimatedCost =
            (usage.promptTokens / 1_000_000) * pricing.input +
            (usage.completionTokens / 1_000_000) * pricing.output;

        const entry: CostEntry = {
            provider,
            model,
            usage,
            estimatedCost,
            timestamp: Date.now(),
        };

        this.entries.push(entry);
        this.totalCost += estimatedCost;

        logger.debug({
            provider,
            model,
            tokens: usage.totalTokens,
            cost: `$${estimatedCost.toFixed(6)}`
        }, 'LLM usage tracked');

        return entry;
    }

    /**
     * Get aggregated stats
     */
    getStats(): {
        totalCost: number;
        totalTokens: number;
        callCount: number;
        byProvider: Record<string, { cost: number; tokens: number; calls: number }>;
    } {
        const byProvider: Record<string, { cost: number; tokens: number; calls: number }> = {};

        for (const entry of this.entries) {
            if (!byProvider[entry.provider]) {
                byProvider[entry.provider] = { cost: 0, tokens: 0, calls: 0 };
            }
            byProvider[entry.provider].cost += entry.estimatedCost;
            byProvider[entry.provider].tokens += entry.usage.totalTokens;
            byProvider[entry.provider].calls += 1;
        }

        return {
            totalCost: this.totalCost,
            totalTokens: this.entries.reduce((sum, e) => sum + e.usage.totalTokens, 0),
            callCount: this.entries.length,
            byProvider,
        };
    }

    /**
     * Reset tracker (e.g., for a new session)
     */
    reset(): void {
        this.entries = [];
        this.totalCost = 0;
    }
}

export const costTracker = new LLMCostTracker();

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'rate_limit',
        'overloaded',
        '429',
        '500',
        '502',
        '503',
        '504',
    ],
};

/**
 * Wrapper that adds retry logic and cost tracking to any LLM provider
 */
export class RetryingLLMProvider implements LLMProvider {
    public readonly name: string;

    constructor(
        private provider: LLMProvider,
        private retryConfig: Partial<RetryConfig> = {}
    ) {
        this.name = provider.name;
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(error: any): boolean {
        const config = { ...DEFAULT_RETRY_CONFIG, ...this.retryConfig };
        const errorString = String(error?.message || error || '').toLowerCase();

        return config.retryableErrors.some(pattern =>
            errorString.includes(pattern.toLowerCase())
        );
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    private calculateDelay(attempt: number): number {
        const config = { ...DEFAULT_RETRY_CONFIG, ...this.retryConfig };
        const baseDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
        const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
        return Math.min(baseDelay + jitter, config.maxDelayMs);
    }

    /**
     * Generate with retry logic
     */
    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        const config = { ...DEFAULT_RETRY_CONFIG, ...this.retryConfig };
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                const response = await this.provider.generate(prompt, options);

                // Track cost
                costTracker.track(this.name, options.model || 'default', response.usage);

                return response;
            } catch (error: any) {
                lastError = error;

                if (attempt < config.maxRetries && this.isRetryableError(error)) {
                    const delay = this.calculateDelay(attempt);
                    logger.warn({
                        provider: this.name,
                        attempt: attempt + 1,
                        maxRetries: config.maxRetries,
                        delay,
                        error: error.message
                    }, 'LLM call failed, retrying...');

                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }

    /**
     * Generate JSON with retry logic
     */
    async generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        const config = { ...DEFAULT_RETRY_CONFIG, ...this.retryConfig };
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                return await this.provider.generateJSON(prompt, schema, options);
            } catch (error: any) {
                lastError = error;

                // Also retry on JSON parse errors (LLM might give better output on retry)
                const isJsonError = error.message?.includes('JSON') || error.message?.includes('parse');

                if (attempt < config.maxRetries && (this.isRetryableError(error) || isJsonError)) {
                    const delay = this.calculateDelay(attempt);
                    logger.warn({
                        provider: this.name,
                        attempt: attempt + 1,
                        maxRetries: config.maxRetries,
                        delay,
                        error: error.message
                    }, 'LLM JSON call failed, retrying...');

                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }
}
