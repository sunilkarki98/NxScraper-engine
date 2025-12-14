import { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
import { browserPool } from '@nx-scraper/shared';
import { ghostCursor } from '@nx-scraper/shared';
import { captchaSolver } from '@nx-scraper/shared';
import { getAICache } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { createHash } from 'crypto';
import { isMainThread } from 'worker_threads';

interface BusinessResult {
    name: string;
    rating: string;
    address: string;
    phone: string | null;
    website: string | null;
    hours?: string;
    priceLevel?: string;
}

export class GoogleScraper implements IScraper {
    name = 'google-scraper';
    version = '2.0.0'; // Enhanced version

    private _cache: ReturnType<typeof getAICache> | null = null;
    private lastRequestTime = 0;
    private readonly MIN_REQUEST_DELAY = 2000; // 2 seconds between requests
    private readonly MAX_REQUEST_DELAY = 5000; // 5 seconds max
    private readonly CACHE_ENABLED = true; // Enabled for both main thread and workers

    // Lazy cache getter - only initialize when actually needed
    private get cache(): ReturnType<typeof getAICache> | null {
        if (!this._cache && this.CACHE_ENABLED) {
            this._cache = getAICache();
        }
        return this._cache;
    }

    async canHandle(url: string): Promise<number> {
        const domain = new URL(url).hostname;
        if (domain.includes('google.com') && url.includes('/search')) {
            return 1.0;
        }
        return 0;
    }

    /**
     * Enhanced scrape with pagination support
     */
    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        // Check cache first (only in main thread)
        if (this.CACHE_ENABLED && this.cache) {
            const cacheKey = this.generateCacheKey(options.url);
            const cached = await this.cache.get<ScrapeResult>(cacheKey).catch(() => null);

            if (cached && !options.bypassCache) {
                logger.info('📦 Returning cached Google scrape results');
                return cached;
            }
        }

        const startTime = Date.now();
        let instanceId: string | null = null;
        let page: any = null;

        try {
            logger.info(`🔍 GoogleScraper v2.0: Starting enhanced search for ${options.url}`);

            // Rate limiting - wait between requests
            await this.waitForRateLimit();

            // Use proxy from options (orchestrator handles proxy selection)
            const proxyUrl = options.proxy;

            // Acquire browser page from pool (Playwright)
            const { page: acquiredPage, instanceId: id } = await browserPool.acquirePage({
                engine: 'playwright',
                headless: true,
                proxy: proxyUrl
            });

            page = acquiredPage;
            instanceId = id;

            // Navigate to URL
            await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // 1. Handle Cookie Consent with ghost cursor
            await this.handleConsent(page);

            // 2. Check for CAPTCHA and solve if needed
            const captchaDetected = await this.detectCaptcha(page);
            if (captchaDetected) {
                logger.warn('🔐 CAPTCHA detected, attempting to solve...');
                const solved = await captchaSolver.solve(page, {
                    type: 'recaptcha-v2',
                    pageUrl: page.url()
                });
                if (!solved.success) {
                    logger.warn('⚠️ CAPTCHA solve failed, results may be limited');
                }
            }

            // 3. Wait for Results
            try {
                await page.waitForSelector('#search', { timeout: 10000 });
            } catch (e) {
                logger.warn("Google search results selector not found");
            }

            // 4. Extract Data with enhanced extraction
            const organicResults = await this.extractOrganicResults(page);
            const localPackResults = await this.extractLocalPack(page);

            // 5. Pagination support (optional)
            const maxPages = options.maxLinks ? Math.ceil(options.maxLinks / 20) : 1;
            const allLocalResults = [...localPackResults];

            if (maxPages > 1) {
                logger.info(`📄 Scraping ${maxPages} pages of results`);
                for (let pageNum = 1; pageNum < maxPages; pageNum++) {
                    const moreResults = await this.scrapePage(page, pageNum);
                    allLocalResults.push(...moreResults);
                    await this.waitForRateLimit(); // Rate limit between pages
                }
            }

            // 6. Deduplicate results
            const uniqueResults = this.deduplicateBusinesses(allLocalResults);

            const title = await page.title();

            const links = [
                ...organicResults.map((r: any) => ({ text: r.title, href: r.link })),
                ...uniqueResults.map((r: any) => ({
                    text: `[BUSINESS] ${r.name} ${r.rating ? '(' + r.rating + '⭐)' : ''}`,
                    href: r.website || ''
                }))
            ];

            const content = `
                Organic Results:
                ${organicResults.map((r: any) => `- ${r.title}: ${r.snippet}`).join('\n')}

                Local Businesses (${uniqueResults.length} found):
                ${uniqueResults.map((r: any) => {
                return `- ${r.name} ${r.rating ? '(' + r.rating + ')' : ''}\n` +
                    `  ${r.address || 'Address not available'}\n` +
                    `  ${r.phone || 'Phone not available'}\n` +
                    `  ${r.website || 'Website not available'}\n` +
                    `  ${r.hours || ''}`
            }).join('\n')}
            `;

            const result: ScrapeResult = {
                success: true,
                data: {
                    title,
                    description: `Google Search Results for: ${options.url}`,
                    content,
                    links,
                    leads: {
                        emails: [],
                        phones: uniqueResults.map((r: any) => r.phone).filter((p: any) => p !== null) as string[],
                        socialLinks: []
                    },
                    organicResults,
                    localPackResults: uniqueResults
                },
                metadata: {
                    url: options.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime,
                    engine: this.name,
                    proxyUsed: options.proxy,
                    version: this.version,
                    cached: false,
                    totalResults: uniqueResults.length
                }
            };

            // Cache results for 6 hours (only in main thread)
            if (this.CACHE_ENABLED && this.cache) {
                const cacheKey = this.generateCacheKey(options.url);
                await this.cache.set(cacheKey, result, 21600).catch((err: any) => {
                    logger.warn({ err }, 'Failed to cache Google scrape results');
                });
            }

            return result;

        } catch (error: any) {
            logger.error(error, `GoogleScraper failed:`);

            return {
                success: false,
                error: error.message,
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

    /**
     * Rate limiting - wait between requests with random delay
     */
    private async waitForRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        const randomDelay = this.MIN_REQUEST_DELAY + Math.random() * (this.MAX_REQUEST_DELAY - this.MIN_REQUEST_DELAY);

        if (timeSinceLastRequest < randomDelay) {
            const waitTime = randomDelay - timeSinceLastRequest;
            logger.debug(`⏱️ Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        this.lastRequestTime = Date.now();
    }

    /**
     * Detect CAPTCHA on page
     */
    private async detectCaptcha(page: any): Promise<boolean> {
        try {
            const captchaSelectors = [
                '#recaptcha',
                '.g-recaptcha',
                'iframe[src*="recaptcha"]',
                'iframe[src*="hcaptcha"]'
            ];

            for (const selector of captchaSelectors) {
                const element = await page.$(selector);
                if (element) return true;
            }

            return false;
        } catch {
            return false;
        }
    }

    /**
     * Handle cookie consent with ghost cursor for human-like behavior
     */
    private async handleConsent(page: any): Promise<void> {
        try {
            // Try to find consent button
            const consentButtonSelector = 'button[aria-label="Accept all"]';
            const exists = await page.$(consentButtonSelector);

            if (exists) {
                logger.debug('🍪 Handling cookie consent with ghost cursor');
                // Use ghost cursor for human-like clicking
                await ghostCursor.moveAndClick(page, consentButtonSelector);
                await page.waitForTimeout(1000);
            } else {
                // Fallback: look for buttons with text
                const buttons = await page.$$('button');
                for (const btn of buttons) {
                    const text = await btn.innerText();
                    if (text.includes('Accept all') || text.includes('I agree')) {
                        await btn.click();
                        await page.waitForTimeout(1000);
                        break;
                    }
                }
            }
        } catch (e) {
            // Consent handling failed, continue anyway
            logger.debug('Cookie consent not found or failed');
        }
    }

    /**
     * Extract organic search results
     */
    private async extractOrganicResults(page: any) {
        return page.evaluate(() => {
            const results: { title: string; link: string; snippet: string }[] = [];
            const elements = document.querySelectorAll('.g');

            elements.forEach((el: any) => {
                const titleEl = el.querySelector('h3');
                const linkEl = el.querySelector('a');
                const snippetEl = el.querySelector('.VwiC3b');

                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.textContent || '',
                        link: linkEl.getAttribute('href') || '',
                        snippet: snippetEl?.textContent || ''
                    });
                }
            });
            return results;
        });
    }

    /**
     * Enhanced local pack extraction with all fixes
     */
    private async extractLocalPack(page: any): Promise<BusinessResult[]> {
        return page.evaluate(() => {
            const businesses: BusinessResult[] = [];
            const items = document.querySelectorAll('[jscontroller="AtSb"]');

            if (items.length > 0) {
                items.forEach((el: any) => {
                    const name = el.querySelector('[role="heading"]')?.textContent || '';
                    const rating = el.querySelector('.Yi4kAD')?.textContent || '';

                    // ✅ FIX: Extract address properly
                    const addressSpans = el.querySelectorAll('.W4Efsd span');
                    const address = addressSpans.length > 1 ?
                        addressSpans[addressSpans.length - 1].textContent?.trim() : '';

                    // ✅ FIX: Support Nepal and international phone formats
                    const containerText = el.textContent || '';
                    // Updated regex to support:
                    // - Nepal: +977-1-XXXXXXX or 01-XXXXXXX
                    // - International: +XX-XXX-XXX-XXXX
                    // - US: (XXX) XXX-XXXX
                    const phoneMatch = containerText.match(
                        /(?:\+977|01)[\s.-]?\d{1}[\s.-]?\d{7}|(?:\+\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/
                    );
                    const phone = phoneMatch ? phoneMatch[0] : null;

                    // ✅ ADD: Opening hours
                    const hoursEl = el.querySelector('.ZDu9vd');
                    const hours = hoursEl?.textContent || undefined;

                    // ✅ ADD: Price level
                    const priceLevelEl = el.querySelector('.ZDu9vd + span');
                    const priceLevel = priceLevelEl?.textContent || undefined;

                    const websiteEl = el.querySelector('a[href^="http"]:not([href*="google"])');
                    const website = websiteEl ? websiteEl.getAttribute('href') : null;

                    if (name) {
                        businesses.push({
                            name,
                            rating,
                            address: address || '',
                            phone,
                            website,
                            hours,
                            priceLevel
                        });
                    }
                });
            } else {
                // Fallback selector strategy
                const websiteButtons = Array.from(document.querySelectorAll('a')).filter((a: any) => a.textContent === 'Website');
                websiteButtons.forEach((btn: any) => {
                    const container = btn.closest('.VkpGBb');
                    if (container) {
                        const name = container.querySelector('[role="heading"]')?.textContent || '';
                        const rating = container.querySelector('.Yi4kAD')?.textContent || '';

                        // Address extraction for fallback
                        const addressSpans = container.querySelectorAll('.W4Efsd span');
                        const address = addressSpans.length > 1 ?
                            addressSpans[addressSpans.length - 1].textContent?.trim() : '';

                        const phoneMatch = container.textContent?.match(
                            /(?:\+977|01)[\s.-]?\d{1}[\s.-]?\d{7}|(?:\+\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/
                        );

                        businesses.push({
                            name,
                            rating,
                            address: address || '',
                            phone: phoneMatch ? phoneMatch[0] : null,
                            website: btn.getAttribute('href')
                        });
                    }
                });
            }

            return businesses;
        });
    }

    /**
     * Scrape additional page (for pagination)
     */
    private async scrapePage(page: any, pageNum: number): Promise<BusinessResult[]> {
        try {
            logger.info(`📄 Scraping page ${pageNum + 1}`);

            // Click "Next" button or construct URL for next page
            const nextButton = await page.$('a#pnnext');
            if (nextButton) {
                await ghostCursor.moveAndClick(page, 'a#pnnext');
                await page.waitForTimeout(2000);
                return await this.extractLocalPack(page);
            } else {
                logger.debug('No more pages to scrape');
                return [];
            }
        } catch (error) {
            logger.warn(`Failed to scrape page ${pageNum}: ${error}`);
            return [];
        }
    }

    /**
     * Deduplicate businesses by name (case-insensitive)
     */
    private deduplicateBusinesses(businesses: BusinessResult[]): BusinessResult[] {
        const seen = new Map<string, BusinessResult>();

        for (const business of businesses) {
            const key = business.name.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.set(key, business);
            } else {
                // Keep the one with more complete data
                const existing = seen.get(key)!;
                if (this.getDataCompleteness(business) > this.getDataCompleteness(existing)) {
                    seen.set(key, business);
                }
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Calculate data completeness score
     */
    private getDataCompleteness(business: BusinessResult): number {
        let score = 0;
        if (business.name) score++;
        if (business.address) score++;
        if (business.phone) score++;
        if (business.website) score++;
        if (business.rating) score++;
        if (business.hours) score++;
        return score;
    }

    /**
     * Generate cache key for scrape request
     */
    private generateCacheKey(url: string): string {
        return 'google-scrape:' + createHash('md5').update(url).digest('hex');
    }
}
