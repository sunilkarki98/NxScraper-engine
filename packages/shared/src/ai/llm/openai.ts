import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import OpenAI from 'openai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

export class OpenAIProvider implements LLMProvider {
    public readonly name = 'openai';
    private breaker: CircuitBreaker;

    constructor() {
        this.breaker = new CircuitBreaker('openai', {
            failureThreshold: 5,
            cooldownMs: 60000 // 1 minute cooldown
        });
    }

    private async getClient(apiKey?: string): Promise<{ client: OpenAI; keyId?: string }> {
        // BYO-LLM: Use provided key if available
        if (apiKey) {
            return {
                client: new OpenAI({ apiKey }),
                keyId: undefined // No key ID for externally provided keys
            };
        }

        const key = await externalKeyManager.getKey('openai');
        if (!key) {
            throw new Error('No available OpenAI API keys');
        }

        return {
            client: new OpenAI({ apiKey: key.value }),
            keyId: key.id
        };
    }

    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient(options.apiKey);
            const model = options.model || 'gpt-4o-mini';

            try {
                const messages: any[] = [];
                if (options.systemPrompt) {
                    messages.push({ role: 'system', content: options.systemPrompt });
                }

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

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                });

                if (keyId) {
                    await externalKeyManager.reportSuccess(keyId);
                }

                return {
                    content: completion.choices[0]?.message?.content || '',
                    usage: {
                        promptTokens: completion.usage?.prompt_tokens || 0,
                        completionTokens: completion.usage?.completion_tokens || 0,
                        totalTokens: completion.usage?.total_tokens || 0,
                    },
                    model: completion.model,
                };
            } catch (error: any) {
                if (error.status === 401 || error.status === 429) {
                    if (keyId) {
                        await externalKeyManager.reportFailure(keyId, error.message);
                    }
                }
                throw error;
            }
        });
    }

    async generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient(options.apiKey);
            const model = options.model || 'gpt-4o-mini';

            try {
                const messages: any[] = [];
                if (options.systemPrompt) {
                    messages.push({ role: 'system', content: options.systemPrompt });
                }

                const schemaDescription = JSON.stringify(schema._def, null, 2);
                const enhancedPrompt = `${typeof prompt === 'string' ? prompt : '[Multi-modal content]'}\n\nRespond with valid JSON matching this schema:\n${schemaDescription}`;

                if (typeof prompt === 'string') {
                    messages.push({ role: 'user', content: enhancedPrompt });
                } else {
                    const content = [...prompt, { type: 'text', text: `\n\nRespond with valid JSON matching this schema:\n${schemaDescription}` }];
                    messages.push({ role: 'user', content });
                }

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                    response_format: { type: 'json_object' },
                });

                if (keyId) {
                    await externalKeyManager.reportSuccess(keyId);
                }

                const content = completion.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('Failed to get JSON response');
                }

                try {
                    const parsed = JSON.parse(content);
                    return schema.parse(parsed);
                } catch (error) {
                    throw new Error(`Failed to parse JSON response: ${error}`);
                }
            } catch (error: any) {
                if (error.status === 401 || error.status === 429) {
                    if (keyId) {
                        await externalKeyManager.reportFailure(keyId, error.message);
                    }
                }
                throw error;
            }
        });
    }
}

