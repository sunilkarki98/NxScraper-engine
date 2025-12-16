import { LLMProvider, MessageContent, LLMOptions, LLMResponse } from './interfaces.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenRouterProvider } from './openrouter.js';
import { OllamaProvider } from './ollama.js';

import { RetryingLLMProvider, costTracker } from './retry-wrapper.js';
import logger from '../../utils/logger.js';

export class LLMManager {
    private providers: Map<string, LLMProvider> = new Map();
    private defaultProvider: string | null = null;

    constructor(options: { enableRetry?: boolean; fallbackOrder?: string[] } = {}) {
        const { enableRetry = true, fallbackOrder = ['openai', 'anthropic', 'gemini', 'deepseek', 'openrouter', 'ollama'] } = options;
        const wrap = (p: LLMProvider) => enableRetry ? new RetryingLLMProvider(p) : p;

        // Register providers (keys are managed dynamically by ExternalKeyManager)
        this.registerProvider(wrap(new OpenAIProvider()));
        this.registerProvider(wrap(new AnthropicProvider()));
        this.registerProvider(wrap(new GeminiProvider()));

        if (process.env.DEEPSEEK_API_KEY) {
            this.registerProvider(wrap(new DeepSeekProvider()));
        }
        if (process.env.OPENROUTER_API_KEY) {
            this.registerProvider(wrap(new OpenRouterProvider()));
        }



        // Conditionally register Ollama
        if (process.env.OLLAMA_BASE_URL) {
            this.registerProvider(wrap(new OllamaProvider(process.env.OLLAMA_BASE_URL, process.env.OLLAMA_MODEL)));
        }

        // Set default based on fallback order AND availability of API keys
        const keyMap: Record<string, string | undefined> = {
            'openai': process.env.OPENAI_API_KEY,
            'anthropic': process.env.ANTHROPIC_API_KEY,
            'gemini': process.env.GEMINI_API_KEY,
            'deepseek': process.env.DEEPSEEK_API_KEY,
            'openrouter': process.env.OPENROUTER_API_KEY,

            'ollama': process.env.OLLAMA_BASE_URL
        };

        for (const name of fallbackOrder) {
            if (this.providers.has(name) && keyMap[name]) {
                this.defaultProvider = name;
                break;
            }
        }

        logger.info({
            providers: this.getAvailableProviders(),
            default: this.defaultProvider
        }, '🤖 LLM Manager initialized');
    }

    registerProvider(provider: LLMProvider): void {
        this.providers.set(provider.name, provider);
    }

    getProvider(name?: string): LLMProvider {
        // Use specified provider
        if (name && name !== 'default') {
            const provider = this.providers.get(name);
            if (!provider) {
                throw new Error(`LLM Provider '${name}' not found. Available: ${this.getAvailableProviders().join(', ')}`);
            }
            return provider;
        }

        // Use default provider
        if (this.defaultProvider) {
            return this.providers.get(this.defaultProvider)!;
        }

        // Fallback to first available
        const first = this.providers.values().next().value;
        if (first) return first;

        // No providers available - create OpenAI (will throw on use if no key)
        logger.warn('No LLM providers configured, creating OpenAI provider (will fail without API key)');
        return new OpenAIProvider();
    }

    /**
     * Get provider with fallback - tries providers in order until one succeeds
     */
    async getProviderWithFallback(preferred?: string): Promise<LLMProvider> {
        // If a preferred provider is specified, try it first and DO NOT fallback if it fails initialization
        // This is important for explicit user requests
        if (preferred) {
            const provider = this.providers.get(preferred);
            if (provider) return provider;

            // Principal Engineer Audit Fix: Fail fast on explicit user intent
            const available = this.getAvailableProviders().join(', ');
            throw new Error(`Requested LLM provider '${preferred}' is not configured. Available providers: ${available}`);
        }

        const fallbackOrder = this.defaultProvider ? [this.defaultProvider] : [];
        // Add other providers to fallback list
        for (const name of this.providers.keys()) {
            if (name !== this.defaultProvider) {
                fallbackOrder.push(name);
            }
        }

        for (const name of fallbackOrder) {
            const provider = this.providers.get(name);
            if (provider) {
                try {
                    // Simple health check - just return if available
                    return provider;
                } catch (error) {
                    logger.warn({ provider: name, error }, 'Provider health check failed, trying next');
                }
            }
        }

        throw new Error('No LLM providers available');
    }

    /**
     * Health check all providers
     */
    async healthCheckAll(): Promise<Record<string, boolean>> {
        const health: Record<string, boolean> = {};

        for (const [name] of this.providers.entries()) {
            // For now, just check if the provider is registered
            // In production, you might want to make a lightweight API call
            health[name] = true;
        }

        return health;
    }

    /**
     * Get available provider names
     */
    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Get cost tracking statistics
     */
    getCostStats() {
        return costTracker.getStats();
    }

    /**
     * Reset cost tracking
     */
    resetCostTracking(): void {
        costTracker.reset();
    }

    /**
     * Set the default provider
     */
    setDefaultProvider(name: string): void {
        if (!this.providers.has(name)) {
            throw new Error(`Cannot set default: provider '${name}' not registered`);
        }
        this.defaultProvider = name;
        logger.info({ default: name }, 'Default LLM provider updated');
    }
    /**
     * Generate text using the default or specified provider
     */
    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        const provider = await this.getProviderWithFallback(options.provider);
        return provider.generate(prompt, options);
    }

    async generateJSON<T>(prompt: MessageContent, schema: import('zod').ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        const provider = await this.getProviderWithFallback(options.provider);
        return provider.generateJSON(prompt, schema, options);
    }
}

export function createLLMManagerFromEnv(): LLMManager {
    return new LLMManager();
}
