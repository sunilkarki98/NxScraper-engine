import { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
import { Page } from 'puppeteer';
import { browserPool } from '@nx-scraper/shared';
import { HtmlParser } from '@nx-scraper/shared';
import { ghostCursor } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export class HeavyScraper implements IScraper {
    name = 'heavy-scraper';
    version = '2.0.0'; // Migrated to Playwright

    async canHandle(url: string): Promise<number> {
        // This scraper handles complex sites with anti-bot protection
        const protectedDomains = ['amazon.com', 'linkedin.com', 'facebook.com'];
        const domain = new URL(url).hostname;

        if (protectedDomains.some(d => domain.includes(d))) {
            return 0.9;
        }

        return 0.3; // Lower priority, use as fallback
    }

    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        const startTime = Date.now();
        let instanceId: string | null = null;
        let page: Page | null = null;

        try {
            logger.info(`🔨 HeavyScraper: Starting heavy scrape for ${options.url}`);

            // Acquire browser page from pool (Playwright)
            const { page: acquiredPage, instanceId: id } = await browserPool.acquirePage({
                engine: 'playwright',
                headless: true,
                proxy: options.proxy,
                stealth: true
            });

            page = acquiredPage as unknown as Page;
            instanceId = id;

            // Go to URL with robust timeout
            await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // 🖱️ Humanize: Random mouse movements
            logger.debug('🖱️ Moving ghost cursor...');
            await ghostCursor.moveRandomly(page);

            // Wait for custom selector if provided
            if (options.waitForSelector) {
                await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
            }

            const content = await page.content();
            const parser = new HtmlParser(content);

            const title = await page.title();

            // Extract links using Cheerio (fast) instead of page evaluation
            const links = parser.getList('a[href]', ($el: unknown) => ({
                text: ($el as any).text().trim(),
                href: ($el as any).attr('href')
            })).slice(0, options.maxLinks || 50);

            return {
                success: true,
                data: {
                    title,
                    description: parser.getText('meta[name="description"]') || '',
                    content: parser.getText('body') || '',
                    links,
                    leads: {
                        emails: [],
                        phones: [],
                        socialLinks: []
                    },
                    html: options.returnHtml ? content : undefined
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
            logger.error({ err }, `HeavyScraper failed:`);
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
            if (page && instanceId) {
                await browserPool.releasePage(instanceId, page);
            }
        }
    }

    async healthCheck(): Promise<boolean> {
        return true;
    }
}
