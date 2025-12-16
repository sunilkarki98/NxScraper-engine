import { z } from 'zod';

/**
 * Multi-modal content types for vision support
 */
export type MessageContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: string };

export type MessageContent = string | MessageContentPart[];

export interface LLMProvider {
    name: string;
    generate(prompt: MessageContent, options?: LLMOptions): Promise<LLMResponse>;
    generateJSON<T>(prompt: MessageContent, schema: z.ZodSchema<T>, options?: LLMOptions): Promise<T>;
}

export interface LLMOptions {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    model?: string;
    provider?: string;
    json?: boolean;
    apiKey?: string; // BYO-LLM Support
}

export interface LLMResponse {
    content: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    model: string;
}
