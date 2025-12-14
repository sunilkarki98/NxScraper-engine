import { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
import { Page } from 'playwright';
import { browserPool } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

/**
 * Universal Scraper
 * Playwright-based scraper for general-purpose web scraping
 */
export class UniversalScraper implements IScraper {
    name = 'universal-scraper';
    version = '1.0.0';

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
     * Performs web scraping using Playwright
     */
    /**
     * Performs web scraping using Playwright via BrowserPool
     */
    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        const startTime = Date.now();
        let instanceId: string | null = null;
        let page: Page | null = null;
        let usedProxyId: string | undefined;

        try {
            // Acquire page from pool (Playwright engine)
            const result = await browserPool.acquirePage({
                engine: 'playwright',
                proxy: options.proxy,
                headless: true,
                userAgent: options.userAgent,
                wsEndpoint: process.env.BROWSER_WS_ENDPOINT
            });

            page = result.page as Page;
            instanceId = result.instanceId;

            // Set timeout
            page.setDefaultTimeout(options.timeout || 30000);

            // Navigate to URL
            await page.goto(options.url, { waitUntil: 'domcontentloaded' });

            // Optional: Wait for specific selector
            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
            }

            // Extract data
            const html = await page.content();
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
                    html,
                    title,
                    url,
                    screenshot: screenshot ? screenshot.toString('base64') : undefined
                },
                metadata: {
                    url: options.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime,
                    engine: this.name,
                    proxyUsed: options.proxy
                }
            };

        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ err }, `Universal scraper error for ${options.url}`);

            return {
                success: false,
                error: err.message,
                metadata: {
                    url: options.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime,
                    engine: this.name
                }
            };
        } finally {
            if (instanceId && page) {
                await browserPool.releasePage(instanceId, page);
            }
        }
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
