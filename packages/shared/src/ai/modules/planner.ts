import { LLMManager } from '../llm/manager.js';
import logger from '../../utils/logger.js';
import { z } from 'zod';
import { PlanStep, ExecutionPlan } from '../types.js';
import { getAICache } from '../cache/ai-cache.js';

export class Planner {
    private cache = getAICache();

    constructor(private llmManager: LLMManager) { }

    /**
     * Converts a natural language goal into a structured execution plan
     */
    async createPlan(goal: string, context: any = {}): Promise<ExecutionPlan> {
        logger.info({ goal }, '🧠 Planner: analyzing goal');

        // Check cache first
        const cacheKey = `plan:${goal}:${JSON.stringify(context)}`;
        const cachedPlan = await this.cache.get<ExecutionPlan>(cacheKey);
        if (cachedPlan) {
            logger.info('🧠 Planner: cache hit');
            return cachedPlan;
        }

        // Define Zod Schema for the Plan
        const PlanStepSchema = z.object({
            id: z.number(),
            type: z.enum(['search', 'scrape', 'browse', 'extract', 'compare']),
            description: z.string(),
            params: z.record(z.string(), z.any()).optional()
        });

        const ExecutionStageSchema = z.object({
            id: z.number(),
            steps: z.array(PlanStepSchema)
        });

        const ExecutionPlanSchema = z.object({
            stages: z.array(ExecutionStageSchema)
        });

        const systemPrompt = `You are an expert web scraping planner. Your job is to break down a user's objective into a series of executable STAGES for an autonomous scraping engine.
        
        Structure:
        - The plan consists of STAGES.
        - Each STAGE contains multiple STEPS.
        - Steps within the same stage are executed IN PARALLEL.
        - Stages are executed SEQUENTIALLY (Stage 1 finishes -> Stage 2 starts).

        Available Steps:
        - search: Find URLs using a search engine (params: query)
        - scrape: Scrape a specific URL (params: url, scraper)
        - extract: Extract specific data from the current page/context (params: fields)
        - browse: Navigate or interact with a page (params: action, selector)
        - compare: Compare data items (params: original, new)

        Rules:
        1. Group independent steps into the same stage for efficiency.
           Example: "Find restaurants in NY and LA" -> Stage 1: [Search NY, Search LA] (Parallel).
        2. Use 'search' if no URL is provided.
        3. Use 'scrape' for data collection.
        4. always include 'extract' after scraping.

        Output valid JSON matching the schema.`;

        try {
            // Use generateJSON with Zod Schema
            const planData = await this.llmManager.generateJSON(
                `Goal: ${goal}\nContext: ${JSON.stringify(context)}`,
                ExecutionPlanSchema,
                {
                    systemPrompt,
                    temperature: 0.2
                }
            );

            const plan: ExecutionPlan = {
                goal,
                stages: planData.stages as any
            };

            logger.info({ stages: plan.stages.length }, '🧠 Planner: plan created');

            // Cache the plan for 24 hours
            await this.cache.set(cacheKey, plan, 24 * 60 * 60);

            return plan;

        } catch (error: any) {
            logger.error({ error }, 'Planner failed to generate plan (likely no LLM keys)');

            // 1. Fallback for direct URLs
            if (goal.startsWith('http')) {
                return {
                    goal,
                    stages: [
                        {
                            id: 1,
                            steps: [
                                { id: 1, type: 'scrape', description: 'Fallback: Scrape URL', params: { url: goal, scraper: 'universal' } }
                            ]
                        },
                        {
                            id: 2,
                            steps: [
                                { id: 2, type: 'extract', description: 'Fallback: Extract content', params: { fields: ['content'] } }
                            ]
                        }
                    ]
                };
            }

            // 2. Fallback for "Search" queries (Regex Heuristics)
            // Matches: "find X", "search for X", "google X"
            if (/^(find|search|google|lookup)\s+/i.test(goal)) {
                const query = goal.replace(/^(find|search|google|lookup)\s+(for\s+)?/i, '').trim();
                return {
                    goal,
                    stages: [
                        {
                            id: 1,
                            steps: [
                                { id: 1, type: 'search', description: 'Fallback: Google Search', params: { query, limit: 5 } }
                            ]
                        },
                        {
                            id: 2,
                            steps: [
                                { id: 2, type: 'scrape', description: 'Fallback: Scrape results', params: { scraper: 'universal' } }
                            ]
                        }
                    ]
                };
            }

            // 3. Last Resort: Fail gracefully
            throw new Error('LLM unavailable and goal too complex for heuristics. Please provide a URL or simple "find" query.');
        }
    }
}
