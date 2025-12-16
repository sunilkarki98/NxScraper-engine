import { AgentModule } from '@nx-scraper/shared';
import { Planner } from '@nx-scraper/shared';
import { Memory } from '@nx-scraper/shared';
import { scraperManager } from '../worker/scraper-manager.js';
import { getGooglePlacesAPI } from '@nx-scraper/google-places';
import { container, Tokens, logger, JobData } from '@nx-scraper/shared';
import { AgentContext, ExecutionPlan, PlanStep, StepResult } from '@nx-scraper/shared';

export class AgentOrchestrator {
    private agentModule: AgentModule;
    private planner: Planner;
    private memory: Memory;
    private aiEngine = container.resolve(Tokens.AIEngine);
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
        model?: string;
        provider?: string;
    }) {
        const { url, goal, mode = 'smart', model, provider } = params;
        logger.info({ url, goal, mode }, '🎼 Orchestrator received task');

        if (!url && mode !== 'autonomous' && mode !== 'agent') {
            throw new Error('URL is required for non-autonomous modes');
        }

        switch (mode) {
            case 'fast':
                return this.runFastStrategy(url!, goal);
            case 'smart':
                return this.runSmartStrategy(url!, goal, { model, provider });
            case 'autonomous':
            case 'agent':
                return this.runAutonomousLoop(goal, url, { model, provider });
            default:
                throw new Error(`Invalid mode: ${mode} `);
        }
    }

    private async runFastStrategy(url: string, goal: string) {
        // Fast strategy doesn't take overrides currently, but we could plumbing it if we change signature of runFastStrategy
        // For now, let's keep it simple or update signature if needed. The prompt asked for plumbing consistency.
        // Let's assume runFastStrategy should also take params eventually, but for now just pass empties or default.
        return this.runStandardPipeline(url, goal, 'universal-scraper');
    }

    private async runSmartStrategy(url: string, goal: string, params: { model?: string, provider?: string } = {}) {
        const { model, provider } = params;
        try {
            // Check memory for past success
            const strategy = await this.memory.recallStrategy(new URL(url).hostname);
            const optimalScraper = strategy?.successfulScraper || 'heavy-scraper';
            return await this.runStandardPipeline(url, goal, optimalScraper, { model, provider });
        } catch (error) {
            logger.warn('Smart scrape failed, falling back to autonomous...');
            return this.runAutonomousLoop(goal, url, { model, provider });
        }
    }

    /**
     * Runs the autonomous Agent loop (Plan -> Execute -> Adapt)
     */
    private async runAutonomousLoop(goal: string, startUrl?: string, params: { model?: string, provider?: string } = {}) {
        logger.info('🧠 Starting Autonomous Agent Loop...');

        // 1. Plan
        // 1. Plan
        const plan = await this.planner.createPlan(goal, { startUrl }, { model: params.model, provider: params.provider });
        logger.info({ stages: plan.stages.length }, '📋 Generated Execution Plan');

        const context: AgentContext = {
            goal,
            currentUrl: startUrl,
            history: {},
            data: {},
            state: {
                visitedUrls: new Set<string>(startUrl ? [startUrl] : [])
            },
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

            const resultsSettled = await Promise.allSettled(stepPromises);

            const results = resultsSettled.map(r => {
                if (r.status === 'fulfilled') return r.value;
                // Should not happen as executeStepWithRetry catches errors, but safe fallback
                return { step: { id: -1, type: 'scrape', description: 'Unknown step' } as PlanStep, result: { success: false, error: 'Unhandled promise rejection' } as StepResult };
            });

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
            results: Object.values(context.history),
            metadata: {
                usedProvider: params.provider || 'default',
                usedModel: params.model || 'default'
            }
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

            case 'browse':
                return this.executeBrowseStep(step, context);

            case 'compare':
                // Logic to compare context.data items
                return { ...baseResult, data: { bestMatch: 'Implement comparison logic' } };

            case 'map':
                return this.executeMapStep(step, context);

            case 'crawl':
                return this.executeCrawlStep(step, context);

            case 'filter':
                return this.executeFilterStep(step, context);

            default:
                throw new Error(`Unknown step type: ${step.type} `);
        }
    }

    /**
     * Executes a Filter Step using AI
     */
    private async executeFilterStep(step: PlanStep, context: AgentContext): Promise<StepResult> {
        const items = step.params?.items || context.data?.results || [];
        const criteria = step.params?.criteria || 'Select the most relevant items';

        if (!Array.isArray(items) || items.length === 0) {
            logger.warn({ step: step.id }, '⚠️ Filter step received no items');
            return { success: true, stepId: step.id, data: { filtered: [] } };
        }

        logger.info({ step: step.id, items: items.length, criteria }, '🧠 AI Filtering items...');

        try {
            // Use the Selection Module via AI Engine
            const result = await this.aiEngine.selection.execute(
                { items, criteria },
                { model: step.params?.model, provider: step.params?.provider }
            );

            if (!result.success) {
                throw new Error(result.error || 'AI selection failed');
            }

            logger.info({
                selected: result.data.selected.length,
                rejected: result.data.rejected.length
            }, '✅ AI Filter complete');

            return {
                success: true,
                stepId: step.id,
                data: {
                    results: result.data.selected,
                    rejected: result.data.rejected,
                    reasoning: result.data.reasoning
                }
            };

        } catch (error: any) {
            logger.error({ error, step: step.id }, '❌ Filter step failed');
            return { success: false, stepId: step.id, error: error.message };
        }
    }

    /**
     * Executes a Map/Fan-out Step
     * Takes a list of items (from previous step or search) and runs a sub-action for each
     */
    private async executeMapStep(step: PlanStep, context: AgentContext): Promise<StepResult> {
        const items = step.params?.items || context.data?.results || [];

        if (!Array.isArray(items) || items.length === 0) {
            logger.warn({ step: step.id }, '⚠️ Map step received no items to process');
            return { success: true, stepId: step.id, data: { results: [] } };
        }

        const maxConcurrency = step.params?.concurrency || 3;
        const subAction = step.params?.action; // e.g., 'scrape'

        logger.info({ step: step.id, items: items.length, action: subAction }, '🔄 Executing Map (Fan-out)');

        const results = [];
        // Simple chunked execution
        for (let i = 0; i < items.length; i += maxConcurrency) {
            const chunk = items.slice(i, i + maxConcurrency);
            const promises = chunk.map(async (item) => {
                try {
                    // Logic to execute sub-action on item
                    // For now, assume item is a URL or has a url property
                    const targetUrl = typeof item === 'string' ? item : item.url || item.link;

                    if (!targetUrl) return { error: 'No URL in item', item };

                    // Reuse runStandardPipeline for now (acts as 'scrape' sub-action)
                    // Future: recursive executeStep call
                    const domain = new URL(targetUrl).hostname;
                    const result = await this.runStandardPipeline(targetUrl, 'Deep scrape', 'universal-scraper');

                    return { success: true, url: targetUrl, data: result.data };
                } catch (error: any) {
                    return { success: false, error: error.message, item };
                }
            });

            const chunkResults = await Promise.all(promises);
            results.push(...chunkResults);
        }

        return {
            success: true,
            stepId: step.id,
            data: { results }
        };
    }

    /**
     * Executes a Browse/Navigation Step
     */
    private async executeBrowseStep(step: PlanStep, context: AgentContext): Promise<StepResult> {
        const url = step.params?.url || context.currentUrl;
        if (!url) throw new Error('No URL for browse step');

        let actions = [];

        // 1. Explicit Actions from Planner
        if (step.params?.action && step.params?.selector) {
            actions.push({
                type: step.params.action,
                selector: step.params.selector,
                value: step.params?.value
            });
        }
        // 2. Implicit Goal -> AI Action Planning
        else if (step.params?.goal || step.description) {
            const goal = step.params?.goal || step.description;
            // logic to get HTML from context or re-scrape
            // For now, assume we need to re-scrape to get fresh HTML for planning if not in context
            // But context.data might not hold full HTML.
            // Let's simplified: Browse step implies we are looking at the current page.

            // Re-scrape to get HTML for planning (lightweight)
            const scrapeResult = await scraperManager.runScraper('universal-scraper', { url, returnHtml: true });

            if (scrapeResult.success && scrapeResult.data?.html) {
                const plan = await this.aiEngine.actionPlanning.execute({
                    url,
                    html: scrapeResult.data.html,
                    goal
                });

                if (plan.success && plan.data?.actions) {
                    actions = plan.data.actions;
                }
            }
        }

        if (actions.length === 0) {
            return { success: false, stepId: step.id, error: 'No actions determined for browse step' };
        }

        // 3. Execute Actions via Scraper
        logger.info({ actions: actions.length }, '🖱️ Executing Browse Actions');

        // We run the scraper AGAIN, but this time passing the actions.
        // The scraper will navigate -> perform actions -> return result (new page state)
        const result = await scraperManager.runScraper('universal-scraper', {
            url,
            actions,
            returnHtml: true
        });

        if (!result.success) {
            return { success: false, stepId: step.id, error: result.error };
        }

        // 4. Update Context
        // If the action caused navigation, the result url might be different?
        // Scraper result should contain the FINAL url.
        const finalUrl = result.data?.url || url;

        return {
            success: true,
            stepId: step.id,
            url: finalUrl, // Update current URL in context
            data: result.data // Update data with new page content
        };
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
                return { data: { results: places }, metadata: { source: 'google_places' } };
            }
        }

        // Fallback to Google Scraper
        const searchResult = await scraperManager.runScraper('google-scraper', {
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            returnHtml: false
        });

        // Return ALL organic results, not just the first one
        const organicResults = searchResult.data?.organicResults || [];
        return {
            url: organicResults[0]?.link, // Keep primary URL for context
            data: { results: organicResults }, // Return list for Map step
            metadata: { source: 'google_scraper' }
        };
    }

    /**
     * Executes a Crawl Step (Recursive Discovery)
     */
    private async executeCrawlStep(step: PlanStep, context: AgentContext): Promise<StepResult> {
        const startUrl = step.params?.url || context.currentUrl;
        if (!startUrl) throw new Error('No URL for crawl step');

        const maxDepth = step.params?.maxDepth || 1;
        const currentDepth = step.params?.currentDepth || 0;
        const linkFilter = step.params?.filter || 'all'; // 'all' or specific criteria
        const action = step.params?.action || 'scrape';

        if (currentDepth >= maxDepth) {
            logger.info({ depth: currentDepth, maxDepth }, '🛑 Max crawl depth reached');
            return { success: true, stepId: step.id, metadata: { status: 'depth_limit' } };
        }

        logger.info({ url: startUrl, depth: currentDepth }, '🕷️ Crawling...');

        // Global Recursion Protection
        const visited = context.state.visitedUrls as Set<string>;
        if (visited && visited.has(startUrl)) {
            logger.info({ url: startUrl }, '🔄 Skipping already visited URL');
            return { success: true, stepId: step.id, metadata: { status: 'skipped_visited' } };
        }
        if (visited) visited.add(startUrl);

        // 1. Scrape Current Page
        const result = await this.runStandardPipeline(startUrl, 'Crawl extraction', 'universal-scraper');

        if (!result.data?.html && !result.data?.links) {
            return { success: false, stepId: step.id, error: 'Failed to extract content/links' };
        }

        // 2. Extract Links (if not already done by scraper)
        // We might need to run a dedicated link extraction if 'universal' didn't return them in a usable format
        // For now, let's assume result.raw.data might have links or we analyze HTML
        // Simplification: We'll assume runStandardPipeline output includes links or we parse them here.
        // Let's rely on standard link extraction for now.

        let links: string[] = [];
        // If we have AI result with links, use them. Otherwise regex from HTML.
        // Quick regex fallback for robust crawling
        if (result.raw?.data?.html) {
            const hrefs = result.raw.data.html.match(/href=["'](https?:\/\/[^"']+)["']/g) || [];
            links = hrefs.map((h: string) => h.match(/href=["']([^"']+)["']/)?.[1]).filter(Boolean) as string[];
        }

        // 3. Filter Links
        let validLinks = [...new Set(links)]; // Dedupe
        // Domain restriction (default to same domain)
        const startDomain = new URL(startUrl).hostname;
        validLinks = validLinks.filter(l => {
            try {
                return new URL(l).hostname === startDomain;
            } catch { return false; }
        });

        // AI Filter if requested
        if (linkFilter !== 'all' && this.aiEngine) {
            const filterResult = await this.aiEngine.selection.execute({
                items: validLinks,
                criteria: `Select links that match: ${linkFilter}`
            });
            if (filterResult.success) {
                validLinks = filterResult.data.selected;
            }
        }

        logger.info({ found: links.length, kept: validLinks.length }, '🕸️ Found links');

        // 4. Recurse (Breadth-First via Parallel Steps or Sequential?)
        // To avoid exploding complexity, we'll schedule them as 'map' style execution or recursive call.
        // Recursive call is dangerous for stack.
        // Better: Return the links and let the Planner/Next Step handle it?
        // OR: Design 'crawl' to handle N links itself.

        // LIMIT: Don't crawl 1000 links in parallel. Cap it.
        const CRAWL_CAP = 5;
        const linksToCrawl = validLinks.slice(0, CRAWL_CAP);

        // We will execute a sub-step for each link
        // This is "Agentic Recursion" - we manually invoke executeStep for children
        const childrenPromise = linksToCrawl.map(link => {
            const childStep: PlanStep = {
                id: step.id + 0.1, // Hacky sub-ID
                type: 'crawl',
                description: `Crawl child ${link}`,
                params: {
                    url: link,
                    maxDepth, // Pass original max
                    currentDepth: currentDepth + 1,
                    filter: linkFilter,
                    action
                }
            };
            return this.executeCrawlStep(childStep, context);
        });

        const childResults = await Promise.all(childrenPromise);

        return {
            success: true,
            stepId: step.id,
            data: {
                url: startUrl,
                content: result.data,
                children: childResults.map(r => r.data)
            }
        };
    }

    /**
     * Runs the standard "Scrape -> Extract" pipeline
     */
    private async runStandardPipeline(url: string, goal: string, scraperName: 'universal-scraper' | 'heavy-scraper' | 'google-scraper', options: { model?: string, provider?: string } = {}) {
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

        if (!scrapeResult.success || !scrapeResult.data?.html) {
            return {
                action: 'error',
                reason: scrapeResult.error || 'Scrape failed or no HTML returned'
            };
        }

        // 2. Ask AI what to do next
        const aiResult = await this.aiEngine.runPipeline({
            url: url, // Changed from task.url to url to match function signature
            html: scrapeResult.data.html || '',
            features: ['understand', 'schema'],
            options: { // Pass AIModuleOptions which includes LLM params
                model: options.model,
                provider: options.provider
            }
        });

        return {
            strategy: 'standard',
            scraper: scraperName,
            data: aiResult.schema?.data || aiResult.understanding?.data,
            raw: scrapeResult.data,
            metadata: {
                usedProvider: options.provider || 'default', // Placeholder, ideally get from AI result
                usedModel: options.model || 'default'
            }
        };
    }
}
