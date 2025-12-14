import { LLMManager } from '../llm/manager.js';
import { AICache } from '../cache/ai-cache.js';
import logger from '../../utils/logger.js';
import { z } from 'zod';

// Define the schema for the Agent's decision
const AgentActionSchema = z.object({
    thought: z.string().describe("Reasoning for the next action"),
    action: z.enum(['CLICK', 'TYPE', 'SCROLL', 'WAIT', 'EXTRACT', 'DONE']).describe("The action to perform"),
    selector: z.string().optional().describe("CSS selector for the action"),
    value: z.string().optional().describe("Text to type or value to use"),
    confidence: z.number().min(0).max(1).describe("Confidence in this action")
});

export type AgentAction = z.infer<typeof AgentActionSchema>;

export class AgentModule {
    private llmManager: LLMManager;
    private cache: AICache;

    constructor(llmManager: LLMManager, cache: AICache) {
        this.llmManager = llmManager;
        this.cache = cache;
    }

    /**
     * The "Brain" of the agent. Decides the next action based on the current state.
     */
    async decide(params: {
        goal: string;
        url: string;
        htmlSnippet: string; // Simplified HTML or accessibility tree
        history: string[]; // Previous actions
        screenshot?: string; // Base64 screenshot (for Vision)
    }): Promise<AgentAction> {
        const { goal, url, htmlSnippet, history } = params;

        const prompt = `
You are an autonomous web scraping agent.
Goal: "${goal}"
Current URL: ${url}

History of actions:
${history.map((h, i) => `${i + 1}. ${h}`).join('\n')}

Current Page State (Simplified HTML):
${htmlSnippet.substring(0, 5000)}... (truncated)

Decide the next action to move closer to the goal.
If you see the data requested in the goal, choose 'EXTRACT'.
If you need to navigate, choose 'CLICK' or 'TYPE'.
If you are finished, choose 'DONE'.

Respond in JSON format matching the schema.
`;

        try {
            // Use a smart model (e.g., GPT-4 or DeepSeek) for reasoning
            // If local, use Ollama (Llama 3)
            const result = await this.llmManager.generateJSON(
                prompt,
                AgentActionSchema,
                {
                    temperature: 0.2, // Low temperature for precise actions
                    model: process.env.AGENT_MODEL || 'gpt-4o' // Default to smart model
                }
            );

            logger.info({ action: result.action, thought: result.thought }, '🤖 Agent decided action');
            return result;

        } catch (error: any) {
            logger.error({ error }, 'Agent decision failed');
            throw error;
        }
    }
}
