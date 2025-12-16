import { z } from 'zod';
import { IAIModule, AIModuleResult, AIModuleOptions } from '../types.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';

export interface SelectionInput {
    items: any[];
    criteria: string;
}

export interface SelectionResult {
    selected: any[];
    rejected: any[];
    reasoning: string;
}

export class SelectionModule implements IAIModule<SelectionInput, SelectionResult> {
    readonly name = 'selection';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: SelectionInput, options: AIModuleOptions = {}): Promise<AIModuleResult<SelectionResult>> {
        const { items, criteria } = input;

        if (!items || items.length === 0) {
            return {
                success: true,
                data: { selected: [], rejected: [], reasoning: 'No items provided' },
                metadata: { model: 'none', tokens: 0, cost: 0, processingTime: 0 }
            };
        }

        const startTime = Date.now();
        const model = options.model || 'gpt-4o-mini'; // Fast model default

        // Simplified Prompt
        const prompt = `
        You are an AI filter. 
        Goal: Select items that match the criteria: "${criteria}"
        
        Items:
        ${JSON.stringify(items.slice(0, 20), null, 2)} 
        // Limit to 20 to avoid context overflow

        Return JSON format:
        {
            "selected_indices": [0, 2, ...],
            "reasoning": "brief explanation"
        }
        `;

        try {
            const response = await this.llmManager.generateJSON<{ selected_indices: number[], reasoning: string }>(
                prompt,
                z.object({
                    selected_indices: z.array(z.number()),
                    reasoning: z.string()
                }),
                { model, provider: options.provider }
            );

            const selected = response.selected_indices.map((i: number) => items[i]).filter(Boolean);
            const rejected = items.filter((_, i) => !response.selected_indices.includes(i));

            return {
                success: true,
                data: {
                    selected,
                    rejected,
                    reasoning: response.reasoning
                },
                metadata: {
                    model,
                    tokens: 0, // todo: track
                    cost: 0, // todo: track
                    processingTime: Date.now() - startTime
                }
            };

        } catch (error: any) {
            logger.error({ error, criteria }, 'Selection module failed');
            return {
                success: false,
                error: error.message,
                metadata: { model, tokens: 0, cost: 0, processingTime: Date.now() - startTime }
            };
        }
    }
}
