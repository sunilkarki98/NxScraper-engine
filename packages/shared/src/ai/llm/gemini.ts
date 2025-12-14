import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { externalKeyManager } from '../../auth/external-key-manager.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

export class GeminiProvider implements LLMProvider {
    public readonly name = 'gemini';
    private breaker: CircuitBreaker;

    constructor() {
        this.breaker = new CircuitBreaker('gemini', {
            failureThreshold: 5,
            cooldownMs: 60000
        });
    }

    private async getClient(): Promise<{ client: GoogleGenerativeAI; keyId: string }> {
        const key = await externalKeyManager.getKey('gemini');
        if (!key) {
            throw new Error('No available Google/Gemini API keys');
        }

        return {
            client: new GoogleGenerativeAI(key.value),
            keyId: key.id
        };
    }

    private getModel(client: GoogleGenerativeAI, modelName?: string): GenerativeModel {
        const model = modelName || 'gemini-1.5-flash';
        return client.getGenerativeModel({ model });
    }

    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const { client, keyId } = await this.getClient();
            const model = this.getModel(client, options.model);

            try {
                let fullPrompt: MessageContent = prompt;
                if (options.systemPrompt && typeof prompt === 'string') {
                    fullPrompt = `${options.systemPrompt}\n\n${prompt}`;
                }

                const generationConfig: any = {};
                if (options.temperature !== undefined) {
                    generationConfig.temperature = options.temperature;
                }
                if (options.maxTokens !== undefined) {
                    generationConfig.maxOutputTokens = options.maxTokens;
                }

                let parts: any[];
                if (typeof fullPrompt === 'string') {
                    parts = [{ text: fullPrompt }];
                } else {
                    parts = fullPrompt.map((part: MessageContentPart) => {
                        if (part.type === 'text') {
                            return { text: part.text };
                        } else if (part.type === 'image_url') {
                            const imageData = part.image_url.startsWith('data:')
                                ? part.image_url
                                : `data:image/jpeg;base64,${part.image_url}`;
                            return { inlineData: { mimeType: 'image/jpeg', data: imageData.split(',')[1] } };
                        }
                        return part;
                    });
                }

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts }],
                    generationConfig,
                });

                const response = result.response;
                const content = response.text();
                const usageMetadata = response.usageMetadata;

                await externalKeyManager.reportSuccess(keyId);

                return {
                    content,
                    usage: {
                        promptTokens: usageMetadata?.promptTokenCount || 0,
                        completionTokens: usageMetadata?.candidatesTokenCount || 0,
                        totalTokens: usageMetadata?.totalTokenCount || 0,
                    },
                    model: options.model || 'gemini-1.5-flash',
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
            const model = this.getModel(client, options.model);

            try {
                const schemaDescription = JSON.stringify(schema._def, null, 2);
                let fullPrompt = `${prompt}\n\nRespond with valid JSON matching this schema:\n${schemaDescription}\n\nDo not include any markdown formatting, code blocks, or explanations. Only output the raw JSON.`;

                if (options.systemPrompt) {
                    fullPrompt = `${options.systemPrompt}\n\n${fullPrompt}`;
                }

                const generationConfig: any = {
                    responseMimeType: 'application/json',
                };
                if (options.temperature !== undefined) {
                    generationConfig.temperature = options.temperature;
                }
                if (options.maxTokens !== undefined) {
                    generationConfig.maxOutputTokens = options.maxTokens;
                }

                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                    generationConfig,
                });

                const response = result.response;
                const content = response.text();

                await externalKeyManager.reportSuccess(keyId);

                try {
                    let cleanContent = content.trim();
                    if (cleanContent.startsWith('```json')) {
                        cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                    } else if (cleanContent.startsWith('```')) {
                        cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
                    }

                    const parsed = JSON.parse(cleanContent);
                    return schema.parse(parsed);
                } catch (error) {
                    throw new Error(`Failed to parse JSON from Gemini response: ${error}`);
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

