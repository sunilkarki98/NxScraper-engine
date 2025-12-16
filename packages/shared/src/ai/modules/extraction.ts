import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';
import { z } from 'zod';

// Generic output schema for unstructured extraction
// The actual output structure depends on the user's prompt or requested schema
const AnyJSON = z.record(z.string(), z.any());
type AnyJSONType = z.infer<typeof AnyJSON>;

export interface ExtractionInput {
    html: string;
    description?: string; // e.g. "Extract all job listings"
    schema?: Record<string, any>; // Optional JSON schema reference
}

/**
 * Extraction Module - Direct LLM-based extraction
 * Capable of "one-shot" parsing of complex unstructured text/HTML
 */
export class ExtractionModule implements IAIModule<ExtractionInput, AnyJSONType, AIModuleOptions> {
    readonly name = 'extraction';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: ExtractionInput, options?: AIModuleOptions): Promise<AIModuleResult<AnyJSONType>> {
        const startTime = Date.now();

        try {
            const llm = this.llmManager.getProvider(options?.provider);

            // Limit HTML size to save tokens (naive approach)
            const safeHtml = input.html.substring(0, 50000);

            const systemPrompt = `You are an expert Data Extraction AI. 
your goal is to extract structured data from the provided HTML content.
Return ONLY valid JSON.
${input.schema ? `Strictly follow this schema structure: \n${JSON.stringify(input.schema, null, 2)}` : 'Infer the best schema based on the content.'}`;

            const userPrompt = `
Content Description: ${input.description || 'Extract the main entities from this page.'}

HTML Context:
${safeHtml}
`;

            const data = await llm.generateJSON<AnyJSONType>(
                userPrompt,
                AnyJSON,
                {
                    systemPrompt,
                    temperature: 0.1, // Low temp for precision
                    model: options?.model
                }
            );

            return {
                data,
                metadata: {
                    module: this.name,
                    provider: llm.name,
                    model: options?.model || 'default',
                    executionTime: Date.now() - startTime,
                    cached: false
                }
            };

        } catch (error: any) {
            logger.error({ error }, 'Extraction module failed');
            throw error;
        }
    }

    async validate(input: ExtractionInput): Promise<boolean> {
        if (!input.html) throw new Error('HTML content is required');
        return true;
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
