import { AgentModule } from '@nx-scraper/shared';
import { Planner } from '@nx-scraper/shared';
import { Memory } from '@nx-scraper/shared';
import { scraperManager } from '@nx-scraper/shared';
import { getAIEngine } from '@nx-scraper/shared';
import { getGooglePlacesAPI } from '@nx-scraper/google-places';
import { logger } from '@nx-scraper/shared';
import { AgentContext, ExecutionPlan, PlanStep, StepResult } from '@nx-scraper/shared';

export class AgentOrchestrator {
    private agentModule: AgentModule;
    private planner: Planner;
    private memory: Memory;
    private aiEngine = getAIEngine();
    private placesApi = getGooglePlacesAPI();

    constructor() {
        const llmManager = this.aiEngine['llmManager'];
        this.agentModule = new AgentModule(llmManager, this.aiEngine['cache']);
        this.planner = new Planner(llmManager); // Initialize Planner
        this.memory = new Memory(llmManager);   // Initialize Memory
    }

    /**
     * Execute a scraping task with automatic fallback
     */
    /**
     * Execute a scraping task with automatic fallback
     */
    async execute(params: {
        url?: string;
        goal: string;
        mode?: 'fast' | 'smart' | 'agent' | 'autonomous';
    }) {
        const { url, goal, mode = 'smart' } = params;
        logger.info({ url, goal, mode }, '🎼 Orchestrator received task');

        if (!url && mode !== 'autonomous' && mode !== 'agent') {
            throw new Error('URL is required for non-autonomous modes');
        }

        switch (mode) {
            case 'fast':
                return this.runFastStrategy(url!, goal);
            case 'smart':
                return this.runSmartStrategy(url!, goal);
            case 'autonomous':
            case 'agent':
                return this.runAutonomousLoop(goal, url);
            default:
                throw new Error(`Invalid mode: ${mode}`);
        }
    }

    private async runFastStrategy(url: string, goal: string) {
        return this.runStandardPipeline(url, goal, 'universal-scraper');
    }

    private async runSmartStrategy(url: string, goal: string) {
        try {
            // Check memory for past success
            const strategy = await this.memory.recallStrategy(new URL(url).hostname);
            const optimalScraper = strategy?.successfulScraper || 'heavy-scraper';
            return await this.runStandardPipeline(url, goal, optimalScraper);
        } catch (error) {
            logger.warn('Smart scrape failed, falling back to autonomous...');
            return this.runAutonomousLoop(goal, url);
        }
    }

    /**
     * Runs the autonomous Agent loop (Plan -> Execute -> Adapt)
     */
    private async runAutonomousLoop(goal: string, startUrl?: string) {
        logger.info('🧠 Starting Autonomous Agent Loop...');

        // 1. Plan
        const plan = await this.planner.createPlan(goal, { startUrl });
        logger.info({ stages: plan.stages.length }, '📋 Generated Execution Plan');

        const context: AgentContext = {
            goal,
            currentUrl: startUrl,
            history: {},
            data: {},
            state: {},
            startTime: Date.now(),
            maxRetries: 3
        };

        // 2. Execute Stages
        for (const stage of plan.stages) {
            logger.info({ stage: stage.id, steps: stage.steps.length }, '🏗️ Executing Stage');

            // Execute all steps in the stage in parallel
            const stepPromises = stage.steps.map(step => {
                logger.info({ step: step.id, type: step.type }, '🏃 Starting step');
                return this.executeStepWithRetry(step, context)
                    .then(result => ({ step, result })) // Attach step info to result
                    .catch(error => {
                        logger.error({ step: step.id, error }, '❌ Step failed after retries');
                        return { step, result: { success: false, stepId: step.id, error: error.message } as StepResult };
                    });
            });

            const results = await Promise.all(stepPromises);

            // Process results sequentially to update context safely
            for (const { step, result } of results) {
                context.history[step.id] = result;

                if (result.success) {
                    if (result.url) context.currentUrl = result.url;
                    if (result.data) {
                        context.data = { ...context.data, ...result.data };
                    }
                }
            }
        }

        return {
            strategy: 'autonomous',
            goal,
            plan: plan.stages,
            results: Object.values(context.history)
        };
    }

    /**
     * Wrapper for retrying steps
     */
    private async executeStepWithRetry(step: PlanStep, context: AgentContext): Promise<StepResult> {
        let lastError: any;

        for (let attempt = 1; attempt <= context.maxRetries; attempt++) {
            try {
                return await this.executeStep(step, context);
            } catch (error) {
                lastError = error;
                logger.warn({ step: step.id, attempt, error }, '⚠️ Step execution failed, retrying...');
                // Exponential backoff
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
            }
        }

        throw lastError || new Error('Step failed');
    }

    /**
     * Executes a single step of the plan
     */
    private async executeStep(step: PlanStep, context: AgentContext): Promise<StepResult> {
        const baseResult: StepResult = { success: true, stepId: step.id };

        switch (step.type) {
            case 'search':
                const searchRes = await this.executeSearchStep(step);
                return { ...baseResult, ...searchRes };

            case 'scrape':
                const url = step.params?.url || context.currentUrl;
                if (!url) throw new Error('No URL for scrape step');

                // Adaptive Scraper Selection
                const domain = new URL(url).hostname;
                const memory = await this.memory.recallStrategy(domain);
                const scraper = memory?.successfulScraper || step.params?.scraper || 'universal-scraper';

                const scrapePipelineRes = await this.runStandardPipeline(url, 'Extract content', scraper);

                // Learn from success
                if (scrapePipelineRes) {
                    await this.memory.memorizeStrategy(domain, scraper, ['scrape']);
                }

                // normalize result
                return {
                    ...baseResult,
                    data: scrapePipelineRes.data,
                    metadata: { scraper: scrapePipelineRes.scraper }
                };

            case 'extract':
                // AI extraction is usually part of runStandardPipeline, 
                // but checking context if we need to refine data
                return { ...baseResult, data: { extracted: context.data } }; // Placeholder

            case 'compare':
                // Logic to compare context.data items
                return { ...baseResult, data: { bestMatch: 'Implement comparison logic' } };

            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    }

    /**
     * Executes a Google Search Step
     */
    private async executeSearchStep(step: PlanStep) {
        const query = step.params?.query;
        if (!query) throw new Error('Missing query for search step');

        logger.info({ query }, '🔍 Agent performing Google Search');

        // Use Google Places API if finding businesses
        if (query.toLowerCase().includes('hospital') || query.toLowerCase().includes('restaurant')) {
            if (this.placesApi.isConfigured()) {
                const places = await this.placesApi.searchByText({ query });
                return { data: places, metadata: { source: 'google_places' } };
            }
        }

        // Fallback to Google Scraper
        const searchResult = await scraperManager.runScraper('google-scraper', {
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            returnHtml: false
        });

        // Extract first organic link
        const firstLink = searchResult.data.organicResults?.[0]?.link;
        return {
            url: firstLink,
            data: searchResult.data.organicResults,
            metadata: { source: 'google_scraper' }
        };
    }

    /**
     * Runs the standard "Scrape -> Extract" pipeline
     */
    private async runStandardPipeline(url: string, goal: string, scraperName: 'universal-scraper' | 'heavy-scraper' | 'google-scraper') {
        logger.info(`Running pipeline with ${scraperName}...`);

        // 1. Scrape (via Worker Thread)
        let scrapeResult = await scraperManager.runScraper(scraperName, {
            url,
            returnHtml: true
        });

        // Adaptive: If blocked (403/429), upgrade scraper
        if (!scrapeResult.success && scraperName === 'universal-scraper') {
            logger.warn('Universal scraper failed, upgrading to Heavy...');
            scraperName = 'heavy-scraper'; // Upgrade
            scrapeResult = await scraperManager.runScraper(scraperName, { url, returnHtml: true });
        }

        if (!scrapeResult.success || !scrapeResult.data.html) {
            throw new Error(`Scraper failed: ${scrapeResult.error}`);
        }

        // 2. AI Extraction
        const aiResult = await this.aiEngine.runPipeline({
            url,
            html: scrapeResult.data.html,
            features: ['understand', 'schema'],
        });

        return {
            strategy: 'standard',
            scraper: scraperName,
            data: aiResult.schema?.data || aiResult.understanding?.data,
            raw: scrapeResult.data
        };
    }
}
