import { LLMProvider, LLMOptions, LLMResponse, MessageContent, MessageContentPart } from './interfaces.js';
import { z } from 'zod';
import { request } from 'undici';
import logger from '../../utils/logger.js';
import { CircuitBreaker } from '../../utils/circuit-breaker.js';

/**
 * Ollama LLM Provider
 * Connects to a local Ollama instance for free, private inference.
 */
export class OllamaProvider implements LLMProvider {
    public readonly name = 'ollama';
    private baseUrl: string;
    private defaultModel: string;
    private breaker: CircuitBreaker;

    constructor(baseUrl: string = 'http://host.docker.internal:11434', defaultModel: string = 'llama3') {
        this.baseUrl = baseUrl;
        this.defaultModel = defaultModel;
        this.breaker = new CircuitBreaker('ollama', {
            failureThreshold: 3, // Lower threshold for local service
            cooldownMs: 30000
        });
    }

    async generate(prompt: MessageContent, options: LLMOptions = {}): Promise<LLMResponse> {
        return this.breaker.execute(async () => {
            const model = options.model || this.defaultModel;

            try {
                // For Ollama, convert MessageContent to string if multi-modal
                // Note: Ollama has limited multi-modal support, so we'll just extract text
                let promptStr: string;
                if (typeof prompt === 'string') {
                    promptStr = prompt;
                } else {
                    promptStr = prompt
                        .filter((p: MessageContentPart) => p.type === 'text')
                        .map((p: MessageContentPart) => (p as any).text)
                        .join('\n');
                }

                const { statusCode, body } = await request(`${this.baseUrl}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        prompt: promptStr,
                        stream: false,
                        options: {
                            temperature: options.temperature,
                            num_predict: options.maxTokens,
                        }
                    })
                });

                if (statusCode >= 300) {
                    const errorText = await body.text();
                    throw new Error(`Ollama API error: ${statusCode} - ${errorText}`);
                }

                const data = await body.json() as any;

                return {
                    content: data.response,
                    usage: {
                        promptTokens: data.prompt_eval_count || 0,
                        completionTokens: data.eval_count || 0,
                        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
                    },
                    model: model,
                };
            } catch (error: any) {
                logger.error({ error: error.message, model, baseUrl: this.baseUrl }, 'Ollama generation failed');
                throw new Error(`Ollama generation failed: ${error.message}`);
            }
        });
    }

    async generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options: LLMOptions = {}): Promise<T> {
        return this.breaker.execute(async () => {
            const model = options.model || this.defaultModel;

            // Enhance prompt to enforce JSON
            const schemaDescription = JSON.stringify(schema._def, null, 2);
            const enhancedPrompt = `${prompt}\n\nRespond ONLY with valid JSON matching this schema:\n${schemaDescription}\n\nDo not include any markdown formatting or explanations.`;

            try {
                const { statusCode, body } = await request(`${this.baseUrl}/api/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model,
                        prompt: enhancedPrompt,
                        format: 'json', // Ollama supports native JSON mode
                        stream: false,
                        options: {
                            temperature: options.temperature || 0.1, // Lower temp for structured data
                            num_predict: options.maxTokens,
                        }
                    })
                });

                if (statusCode >= 300) {
                    const errorText = await body.text();
                    throw new Error(`Ollama API error: ${statusCode} - ${errorText}`);
                }

                const data = await body.json() as any;
                const content = data.response;
                const parsed = JSON.parse(content);
                return schema.parse(parsed);
            } catch (error: any) {
                logger.error({ error: error.message, model }, 'Ollama JSON generation failed');
                throw new Error(`Ollama JSON generation failed: ${error.message}`);
            }
        });
    }
}

