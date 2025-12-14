import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import logger from '../../utils/logger.js';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

/**
 * OpenRouter Provider
 * Unified access to 100+ LLM models through OpenRouter API
 * https://openrouter.ai/docs
 */
export class OpenRouterProvider implements LLMProvider {
    public readonly name = 'openrouter';
    private baseURL = 'https://openrouter.ai/api/v1';
    private appName: string;
    private breaker: CircuitBreaker;

    constructor() {
        this.appName = process.env.OPENROUTER_APP_NAME || 'nxscraper-engine';
        this.breaker = new CircuitBreaker('openrouter', {
            failureThreshold: 5,
            cooldownMs: 60000
        });
    }

    private async getKey(): Promise<{ value: string; id: string }> {
        const key = await externalKeyManager.getKey('openrouter');
        if (!key) {
            throw new Error('No available OpenRouter API keys');
        }
        return { value: key.value, id: key.id };
    }

    /**
     * Generate text completion
     */
    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const { value: apiKey, id: keyId } = await this.getKey();

            try {
                // Build messages array
                const messages: any[] = [];
                if (options.systemPrompt) {
                    messages.push({ role: 'system', content: options.systemPrompt });
                }

                // Handle both string and multi-modal content
                if (typeof prompt === 'string') {
                    messages.push({ role: 'user', content: prompt });
                } else {
                    const content = prompt.map((part: MessageContentPart) => {
                        if (part.type === 'text') {
                            return { type: 'text', text: part.text };
                        } else if (part.type === 'image_url') {
                            return { type: 'image_url', image_url: { url: part.image_url } };
                        }
                        return part;
                    });
                    messages.push({ role: 'user', content });
                }

                const response = await fetch(`${this.baseURL}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'HTTP-Referer': 'https://nxscraper.com',
                        'X-Title': this.appName,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: options.model || 'openai/gpt-3.5-turbo',
                        messages,
                        temperature: options.temperature || 0.7,
                        max_tokens: options.maxTokens || 2000,
                    }),
                });

                if (!response.ok) {
                    const error = await response.text();
                    if (response.status === 401 || response.status === 429) {
                        await externalKeyManager.reportFailure(keyId, error);
                    }
                    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
                }

                const data = await response.json();
                await externalKeyManager.reportSuccess(keyId);

                return {
                    content: data.choices[0].message.content,
                    usage: {
                        promptTokens: data.usage?.prompt_tokens || 0,
                        completionTokens: data.usage?.completion_tokens || 0,
                        totalTokens: data.usage?.total_tokens || 0,
                    },
                    model: data.model || options.model || 'unknown',
                };
            } catch (error: any) {
                throw error;
            }
        });
    }

    /**
     * Generate structured JSON output
     */
    async generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        const systemPrompt = options.systemPrompt
            ? `${options.systemPrompt}\n\nIMPORTANT: You must respond with valid JSON only. No markdown, no explanations, just pure JSON.`
            : 'You must respond with valid JSON only. No markdown, no explanations, just pure JSON.';

        const response = await this.generate(prompt, {
            ...options,
            systemPrompt,
            temperature: options.temperature || 0.2, // Lower temp for structured output
        });

        // Try to extract JSON from markdown code blocks if present
        let jsonStr = response.content.trim();
        const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
        }

        // Parse and validate
        try {
            const parsed = JSON.parse(jsonStr);
            return schema.parse(parsed);
        } catch (error: any) {
            logger.error({ error, content: response.content }, 'Failed to parse JSON from OpenRouter response');
            throw new Error(`JSON parsing failed: ${error.message}`);
        }
    }
}

