import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import OpenAI from 'openai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

/**
 * DeepSeek LLM Provider
 * DeepSeek uses an OpenAI-compatible API, so we leverage the OpenAI SDK
 * with a custom base URL pointing to DeepSeek's API endpoint.
 */
export class DeepSeekProvider implements LLMProvider {
    public readonly name = 'deepseek';
    private breaker: CircuitBreaker;

    constructor() {
        this.breaker = new CircuitBreaker('deepseek', {
            failureThreshold: 5,
            cooldownMs: 60000
        });
    }

    private async getClient(): Promise<{ client: OpenAI; keyId: string }> {
        const key = await externalKeyManager.getKey('deepseek');
        if (!key) {
            throw new Error('No available DeepSeek API keys');
        }

        return {
            client: new OpenAI({
                apiKey: key.value,
                baseURL: 'https://api.deepseek.com',
            }),
            keyId: key.id
        };
    }

    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient();
            // DeepSeek models: deepseek-chat, deepseek-coder, deepseek-reasoner
            const model = options.model || 'deepseek-chat';

            try {
                const messages: any[] = [];
                if (options.systemPrompt) {
                    messages.push({ role: 'system', content: options.systemPrompt });
                }

                // Handle both string and multi-modal content (use OpenAI format)
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

                await externalKeyManager.reportSuccess(keyId);

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
                    await externalKeyManager.reportFailure(keyId, error.message);
                }
                throw error;
            }
        });
    }

    async generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient();
            const model = options.model || 'deepseek-chat';

            try {
                const messages: any[] = [];
                if (options.systemPrompt) {
                    messages.push({ role: 'system', content: options.systemPrompt });
                }

                // Include schema description in the prompt to guide the model
                const schemaDescription = JSON.stringify(schema._def, null, 2);
                const enhancedPrompt = `${prompt}\n\nRespond with valid JSON matching this schema:\n${schemaDescription}\n\nDo not include any markdown formatting, code blocks, or explanations. Only output the raw JSON.`;
                messages.push({ role: 'user', content: enhancedPrompt });

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    temperature: options.temperature,
                    max_tokens: options.maxTokens,
                    response_format: { type: 'json_object' },
                });

                await externalKeyManager.reportSuccess(keyId);

                const content = completion.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('Failed to get JSON response from DeepSeek');
                }

                try {
                    let cleanContent = content.trim();
                    // Remove potential markdown code blocks
                    if (cleanContent.startsWith('```json')) {
                        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                    } else if (cleanContent.startsWith('```')) {
                        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
                    }

                    const parsed = JSON.parse(cleanContent);
                    return schema.parse(parsed);
                } catch (error) {
                    throw new Error(`Failed to parse JSON from DeepSeek response: ${error}`);
                }
            } catch (error: any) {
                if (error.status === 401 || error.status === 429) {
                    await externalKeyManager.reportFailure(keyId, error.message);
                }
                throw error;
            }
        });
    }
}

