import { BasePlaywrightScraper, ScrapeOptions, ScrapeResult, container, Tokens } from '@nx-scraper/shared';
import { Page } from 'playwright';

import { logger } from '@nx-scraper/shared';

export class UltraScraper extends BasePlaywrightScraper {
    name = 'ultra-scraper';
    version = '2.1.0'; // Consolidated

    async canHandle(url: string): Promise<number> {
        // This scraper handles complex sites with anti-bot protection
        const protectedDomains = ['amazon.com', 'linkedin.com', 'facebook.com'];
        const domain = new URL(url).hostname;

        if (protectedDomains.some(d => domain.includes(d))) {
            return 0.9;
        }
        return 0.3;
    }

    /**
     * Implement specialized parsing for Ultra Scraper
     */
    protected async parse(page: Page, options: ScrapeOptions): Promise<ScrapeResult> {
        // 🧠 AI Engine
        const aiEngine = container.resolve(Tokens.AIEngine);

        // 🛡️ Smart Evasion & Humanization
        // Handled automatically by BasePlaywrightScraper (The Ghost Protocol)

        // 🎬 Semantic Actions are now handled by BasePlaywrightScraper
        // (lines 70-87 removed)

        // 🧠 AI Action Planning (The "Universal Solver")
        if (options.features?.includes('smart-navigation')) {
            logger.info('🧠 UltraScraper: Analyzing page for navigation opportunities...');

            // 1. Visual/Structure Analysis handled by ActionPlanning module
            // We pass the HTML and URL
            const plan = await aiEngine.actionPlanning.execute({
                url: page.url(),
                html: await page.content(),
                goal: options.description || "Find the main content and ensure it is loaded."
            });

            if (plan.data && plan.data.actions && plan.data.actions.length > 0) {
                logger.info({ steps: plan.data.actions.length }, '🧠 AI devised a navigation plan');
                await this.performActions(page, plan.data.actions);
            }
        }

        // ⛏️ Core Extraction
        let data: any = {};

        // If "schema" is provided, use AI extraction
        if (options.schema) {
            const content = await page.content();
            // Simplify content for AI (remove scripts/styles)
            const cleanHtml = await page.evaluate(() => {
                document.querySelectorAll('script, style, svg').forEach(n => n.remove());
                return document.body.innerText.slice(0, 30000); // Limit size
            });

            logger.info('🧠 Processing with LLM extraction...');
            data = await aiEngine.extraction.execute({
                html: cleanHtml,
                schema: options.schema
            });
            // Normalize wrapper if module returns wrapped 'data'
            if (data.data) data = data.data;

        } else {
            // Default raw dump
            data = {
                html: await page.content(),
                text: await page.innerText('body')
            };
        }

        return {
            success: true,
            data: data,
            metadata: {
                url: options.url,
                timestamp: new Date().toISOString(),
                executionTimeMs: 0, // Base handles this
                engine: this.name
            }
        };
    }
}
