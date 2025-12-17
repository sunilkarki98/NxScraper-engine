import { BasePlaywrightScraper, ScrapeOptions, ScrapeResult, container, Tokens } from '@nx-scraper/shared';
import { Page } from 'playwright';
import { TimeoutError, FailurePoint, toApplicationError, enhanceErrorContext } from '@nx-scraper/shared';
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

            try {
                // Add timeout protection for AI call
                const plan = await Promise.race([
                    aiEngine.actionPlanning.execute({
                        url: page.url(),
                        html: await page.content(),
                        goal: options.description || "Find the main content and ensure it is loaded."
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new TimeoutError('AI action planning', 30000, {}, FailurePoint.AI_PROCESSING)), 30000)
                    )
                ]);

                if (plan?.data?.actions?.length > 0) {
                    logger.info({ steps: plan.data.actions.length }, '🧠 AI devised a navigation plan');
                    await this.performActions(page, plan.data.actions);
                } else {
                    logger.debug('AI planning returned no actions');
                }
            } catch (error: unknown) {
                // AI failure should NOT fail the entire scrape
                const appError = toApplicationError(error);
                logger.warn({
                    error: appError.toJSON(),
                    url: page.url()
                }, '⚠️ AI action planning failed, continuing with basic extraction');
                // Continue without AI-planned actions
            }
        }

        // ⛏️ Core Extraction
        let data: any = {};

        // If "schema" is provided, use AI extraction
        if (options.schema) {
            try {
                const content = await page.content();
                // Simplify content for AI (remove scripts/styles)
                const cleanHtml = await page.evaluate(() => {
                    document.querySelectorAll('script, style, svg').forEach(n => n.remove());
                    return document.body.innerText.slice(0, 30000); // Limit size
                });

                logger.info('🧠 Processing with LLM extraction...');

                // Add timeout protection
                const extraction = await Promise.race([
                    aiEngine.extraction.execute({
                        html: cleanHtml,
                        schema: options.schema
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new TimeoutError('AI extraction', 45000, {}, FailurePoint.AI_PROCESSING)), 45000)
                    )
                ]);

                data = extraction;
                // Normalize wrapper if module returns wrapped 'data'
                if (data?.data) data = data.data;

            } catch (error: unknown) {
                // Fallback to basic extraction if AI fails
                const appError = toApplicationError(error);
                logger.warn({
                    error: appError.toJSON(),
                    url: options.url
                }, '⚠️ AI extraction failed, falling back to basic extraction');

                // Fallback to basic HTML extraction
                data = {
                    html: await page.content(),
                    text: await page.innerText('body'),
                    extractionMethod: 'fallback'
                };
            }
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
