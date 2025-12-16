import { IAIModule, AIModuleOptions, AIModuleResult } from '../interfaces/ai-module.interface.js';
import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import { ActionPlan, ActionPlanSchema } from '../schemas/ai-outputs.schema.js';
import logger from '../../utils/logger.js';
import crypto from 'crypto';

export interface ActionPlanningInput {
    url: string;
    html: string;
    goal: string;
    previousActions?: any[];
}

export class ActionPlanningModule implements IAIModule<ActionPlanningInput, ActionPlan, AIModuleOptions> {
    readonly name = 'action-planning';

    constructor(
        private llmManager: LLMManager,
        private cache: AICache
    ) { }

    async execute(input: ActionPlanningInput, options?: AIModuleOptions): Promise<AIModuleResult<ActionPlan>> {
        const startTime = Date.now();

        try {
            await this.validate(input);

            const llm = this.llmManager.getProvider(options?.provider);

            const systemPrompt = `You are an autonomous web agent planner.
Your goal is to output a JSON sequence of actions to achieve a user's goal on a webpage.
Authorized actions:
- click (requires unique CSS selector)
- fill (requires selector and value)
- wait (value is ms)
- scroll (requires selector or null for bottom)
- select (dropdowns)

Analyze the HTML structure carefully to find robust selectors.`;

            const userPrompt = `
Goal: ${input.goal}
URL: ${input.url}

HTML Context (Simplified):
${input.html.substring(0, 15000)}

Return a strict JSON ActionPlan.`;

            const llmData = await llm.generateJSON<ActionPlan>(
                userPrompt,
                ActionPlanSchema,
                {
                    systemPrompt,
                    temperature: 0.2, // Low temperature for precise action planning
                    model: options?.model,
                }
            );

            return {
                data: llmData,
                metadata: {
                    module: this.name,
                    provider: llm.name,
                    model: options?.model || 'default',
                    executionTime: Date.now() - startTime,
                    cached: false,
                    confidence: llmData.confidence,
                },
            };
        } catch (error: any) {
            logger.error({ error, goal: input.goal }, `${this.name} execution failed`);
            throw error;
        }
    }

    async validate(input: ActionPlanningInput): Promise<boolean> {
        if (!input.goal) throw new Error('Goal is required');
        if (!input.html) throw new Error('HTML context is required');
        return true;
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
