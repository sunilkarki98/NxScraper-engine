import { BasePlaywrightScraper, ScrapeOptions, ScrapeResult, container, Tokens } from '@nx-scraper/shared';
import { Page } from 'playwright';
import { logger, toApplicationError, FailurePoint } from '@nx-scraper/shared';

/**
 * Universal Scraper
 * Playwright-based scraper for general-purpose web scraping
 */
export class UniversalScraper extends BasePlaywrightScraper {
    name = 'universal-scraper';
    version = '2.0.0'; // Refactored to Base

    // private browser: Browser | null = null; // Removed, handled by pool

    /**
     * Determines if this scraper can handle the URL
     * Returns high confidence for all URLs (fallback scraper)
     */
    async canHandle(url: string): Promise<number> {
        // Universal scraper can handle any URL
        // Return 0.5 so specialized scrapers can take priority
        return 0.5;
    }

    /**
     * Core scraping logic implemented from Base Class
     * No need to handle Browser acquisition or try/catch/finally here!
     */
    protected async parse(page: Page, options: ScrapeOptions): Promise<ScrapeResult> {
        // Optional: Wait for specific selector
        if (options.waitForSelector) {
            await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
        }

        // 🛡️ ANTI-BLOCKING DETECTION
        const aiEngine = container.resolve(Tokens.AIEngine);
        const html = await page.content();

        try {
            const blockingCheck = await aiEngine.antiBlocking.execute({
                url: page.url(),
                html: html,
                statusCode: 200
            });

            if (blockingCheck.data?.blockDetected) {
                logger.warn({
                    blockType: blockingCheck.data.blockType,
                    confidence: blockingCheck.data.confidence
                }, '🚫 Anti-blocking system detected potential block');
                // Note: We log but continue - BasePlaywrightScraper will handle if severity is high
            }
        } catch (error: unknown) {
            // AI anti-blocking failure should not fail the scrape
            const appError = toApplicationError(error);
            logger.warn({
                error: appError.toJSON(),
                url: page.url()
            }, '⚠️ Anti-blocking check failed, continuing with extraction');
            // Continue without anti-blocking detection
        }

        // Extract data
        const title = await page.title();
        const url = page.url();

        // Optional: Take screenshot
        let screenshot;
        if (options.screenshot) {
            screenshot = await page.screenshot({ fullPage: true });
        }

        return {
            success: true,
            data: {
                title,
                url,
                html: options.features?.includes('html') ? html : undefined,
                screenshot: screenshot ? screenshot.toString('base64') : undefined,
                text: await page.evaluate(() => document.body.innerText) // Basic text extraction
            },
            metadata: {
                url: options.url,
                timestamp: new Date().toISOString(),
                executionTimeMs: 0, // Calculated by base
                engine: this.name
            }
        };
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        return true;
    }

    async cleanup(): Promise<void> {
        // BrowserPool handles cleanup
    }
}
