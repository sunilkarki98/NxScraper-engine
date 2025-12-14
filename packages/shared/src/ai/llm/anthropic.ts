import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

export class AnthropicProvider implements LLMProvider {
    public readonly name = 'anthropic';
    private breaker: CircuitBreaker;

    constructor() {
        this.breaker = new CircuitBreaker('anthropic', {
            failureThreshold: 5,
            cooldownMs: 60000
        });
    }

    private async getClient(): Promise<{ client: Anthropic; keyId: string }> {
        const key = await externalKeyManager.getKey('anthropic');
        if (!key) {
            throw new Error('No available Anthropic API keys');
        }

        return {
            client: new Anthropic({ apiKey: key.value }),
            keyId: key.id
        };
    }

    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient();
            const model = options.model || 'claude-3-5-sonnet-20240620';

            try {
                const system = options.systemPrompt;

                let content: any;
                if (typeof prompt === 'string') {
                    content = prompt;
                } else {
                    content = prompt.map((part: MessageContentPart) => {
                        if (part.type === 'text') {
                            return { type: 'text', text: part.text };
                        } else if (part.type === 'image_url') {
                            const imageData = part.image_url.startsWith('data:')
                                ? part.image_url.split(',')[1]
                                : part.image_url;
                            return {
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: 'image/jpeg',
                                    data: imageData
                                }
                            };
                        }
                        return part;
                    });
                }

                const messages: any[] = [{ role: 'user', content }];

                const response = await client.messages.create({
                    model,
                    max_tokens: options.maxTokens || 1024,
                    temperature: options.temperature,
                    system,
                    messages,
                });

                await externalKeyManager.reportSuccess(keyId);

                const responseContent = response.content[0].type === 'text' ? response.content[0].text : '';

                return {
                    content: responseContent,
                    usage: {
                        promptTokens: response.usage.input_tokens,
                        completionTokens: response.usage.output_tokens,
                        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
                    },
                    model: response.model,
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
        const jsonPrompt = `${prompt}\n\nRespond strictly in JSON format matching the schema. Do not include any markdown formatting or explanations.`;
        const response = await this.generate(jsonPrompt, options);

        try {
            let cleanContent = response.content.trim();
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }

            const parsed = JSON.parse(cleanContent);
            return schema.parse(parsed);
        } catch (error) {
            throw new Error(`Failed to parse JSON from Anthropic response: ${error}`);
        }
    }
}

