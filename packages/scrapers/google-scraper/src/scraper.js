import { browserPool } from '@nx-scraper/shared';
import { ghostCursor } from '@nx-scraper/shared';
import { captchaSolver } from '@nx-scraper/shared';
import { getAICache } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { createHash } from 'crypto';
import selectors from './config/selectors.json' with { type: "json" };
export class GoogleScraper {
    name = 'google-scraper';
    version = '2.0.0'; // Enhanced version
    _cache = null;
    lastRequestTime = 0;
    MIN_REQUEST_DELAY = 2000; // 2 seconds between requests
    MAX_REQUEST_DELAY = 5000; // 5 seconds max
    CACHE_ENABLED = true; // Enabled for both main thread and workers
    // Lazy cache getter - only initialize when actually needed
    get cache() {
        if (!this._cache && this.CACHE_ENABLED) {
            this._cache = getAICache();
        }
        return this._cache;
    }
    async canHandle(url) {
        const domain = new URL(url).hostname;
        if (domain.includes('google.com') && url.includes('/search')) {
            return 1.0;
        }
        return 0;
    }
    /**
     * Enhanced scrape with pagination support
     */
    async scrape(options) {
        // Check cache first (only in main thread)
        if (this.CACHE_ENABLED && this.cache) {
            const cacheKey = this.generateCacheKey(options.url);
            const cached = await this.cache.get(cacheKey).catch(() => null);
            if (cached && !options.bypassCache) {
                logger.info('📦 Returning cached Google scrape results');
                return cached;
            }
        }
        const startTime = Date.now();
        let instanceId = null;
        let page = null;
        try {
            logger.info(`🔍 GoogleScraper v2.0: Starting enhanced search for ${options.url}`);
            // Rate limiting - wait between requests
            await this.waitForRateLimit();
            // 🧠 ADAPTIVE PROXY: Use intelligent proxy selection
            const { proxyManager } = await import('@nx-scraper/shared');
            const adaptiveProxy = await proxyManager.getBestProxyForUrl(options.url);
            const proxyUrl = adaptiveProxy || options.proxy;
            if (adaptiveProxy) {
                logger.info({ proxy: adaptiveProxy }, '🧠 ProxyManager selected optimized proxy for Google');
            }
            // Acquire browser page from pool (Playwright)
            const { page: acquiredPage, instanceId: id } = await browserPool.acquirePage({
                engine: 'playwright',
                headless: true,
                proxy: proxyUrl
            });
            page = acquiredPage;
            instanceId = id;
            if (!page) {
                throw new Error('Failed to acquire page from browser pool');
            }
            // Navigate to URL
            await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            // 1. Handle Cookie Consent with ghost cursor
            await this.handleConsent(page);
            // 2. Check for CAPTCHA and solve if needed
            const captchaDetected = await this.detectCaptcha(page);
            if (captchaDetected) {
                logger.warn('🔐 CAPTCHA detected, attempting AI Vision solve first...');
                // 🧠 AI VISION ATTEMPT (Free & Fast)
                const { getAIEngine } = await import('@nx-scraper/shared');
                const aiEngine = getAIEngine();
                const visionSolved = await captchaSolver.solveWithVision(page, aiEngine);
                if (visionSolved) {
                    logger.info('✅ CAPTCHA solved with AI Vision (no cost)');
                }
                else {
                    logger.warn('👁️ Vision solver failed, falling back to 2Captcha...');
                    const solved = await captchaSolver.solve(page, {
                        type: 'recaptcha-v2',
                        pageUrl: page.url()
                    });
                    if (!solved.success) {
                        logger.warn('⚠️ CAPTCHA solve failed, results may be limited');
                    }
                }
            }
            // 3. Wait for Results
            try {
                await page.waitForSelector('#search', { timeout: 10000 });
            }
            catch (e) {
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
                ...organicResults.map((r) => ({ text: r.title, href: r.link })),
                ...uniqueResults.map((r) => ({
                    text: `[BUSINESS] ${r.name} ${r.rating ? '(' + r.rating + '⭐)' : ''}`,
                    href: r.website || ''
                }))
            ];
            const content = `
                Organic Results:
                ${organicResults.map((r) => `- ${r.title}: ${r.snippet}`).join('\n')}

                Local Businesses (${uniqueResults.length} found):
                ${uniqueResults.map((r) => {
                return `- ${r.name} ${r.rating ? '(' + r.rating + ')' : ''}\n` +
                    `  ${r.address || 'Address not available'}\n` +
                    `  ${r.phone || 'Phone not available'}\n` +
                    `  ${r.website || 'Website not available'}\n` +
                    `  ${r.hours || ''}`;
            }).join('\n')}
            `;
            const result = {
                success: true,
                data: {
                    title,
                    description: `Google Search Results for: ${options.url}`,
                    content,
                    links,
                    leads: {
                        emails: [],
                        phones: uniqueResults.map((r) => r.phone).filter((p) => p !== null),
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
                await this.cache.set(cacheKey, result, 21600).catch((err) => {
                    logger.warn({ err }, 'Failed to cache Google scrape results');
                });
            }
            return result;
        }
        catch (error) {
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
        }
        finally {
            if (page && instanceId) {
                await browserPool.releasePage(instanceId, page);
            }
        }
    }
    async healthCheck() {
        return true;
    }
    /**
     * Rate limiting - wait between requests with random delay
     */
    async waitForRateLimit() {
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
    async detectCaptcha(page) {
        try {
            const captchaSelectors = selectors.google.captcha.selectors;
            for (const selector of captchaSelectors) {
                const element = await page.$(selector);
                if (element)
                    return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
    /**
     * Handle cookie consent with ghost cursor for human-like behavior
     */
    async handleConsent(page) {
        try {
            // Try to find consent button
            const consentButtonSelector = selectors.google.consent.button;
            const exists = await page.$(consentButtonSelector);
            if (exists) {
                logger.debug('🍪 Handling cookie consent with ghost cursor');
                // Use ghost cursor for human-like clicking
                await ghostCursor.moveAndClick(page, consentButtonSelector);
                await page.waitForTimeout(1000);
            }
            else {
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
        }
        catch (e) {
            // Consent handling failed, continue anyway
            logger.debug('Cookie consent not found or failed');
        }
    }
    /**
     * Extract organic search results
     */
    async extractOrganicResults(page) {
        const sel = selectors.google.organic;
        return page.evaluate((s) => {
            const results = [];
            const elements = document.querySelectorAll(s.container);
            elements.forEach((el) => {
                const titleEl = el.querySelector(s.title);
                const linkEl = el.querySelector(s.link);
                const snippetEl = el.querySelector(s.snippet);
                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.textContent || '',
                        link: linkEl.getAttribute('href') || '',
                        snippet: snippetEl?.textContent || ''
                    });
                }
            });
            return results;
        }, sel);
    }
    /**
     * Enhanced local pack extraction with all fixes
     */
    async extractLocalPack(page) {
        const sel = selectors.google.localPack;
        return page.evaluate((s) => {
            const businesses = [];
            const items = document.querySelectorAll(s.container);
            if (items.length > 0) {
                items.forEach((el) => {
                    const name = el.querySelector(s.name)?.textContent || '';
                    const rating = el.querySelector(s.rating)?.textContent || '';
                    // ✅ FIX: Extract address properly
                    const addressSpans = el.querySelectorAll(s.addressSpans);
                    const address = addressSpans.length > 1 ?
                        addressSpans[addressSpans.length - 1].textContent?.trim() : '';
                    // ✅ FIX: Support Nepal and international phone formats
                    const containerText = el.textContent || '';
                    // Updated regex to support:
                    // - Nepal: +977-1-XXXXXXX or 01-XXXXXXX
                    // - International: +XX-XXX-XXX-XXXX
                    // - US: (XXX) XXX-XXXX
                    const phoneMatch = containerText.match(/(?:\+977|01)[\s.-]?\d{1}[\s.-]?\d{7}|(?:\+\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/);
                    const phone = phoneMatch ? phoneMatch[0] : null;
                    // ✅ ADD: Opening hours
                    const hoursEl = el.querySelector(s.hours);
                    const hours = hoursEl?.textContent || undefined;
                    // ✅ ADD: Price level
                    const priceLevelEl = el.querySelector(s.price);
                    const priceLevel = priceLevelEl?.textContent || undefined;
                    const websiteEl = el.querySelector(s.website);
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
            }
            else {
                // Fallback selector strategy
                const websiteButtons = Array.from(document.querySelectorAll(s.fallback.websiteBtn)).filter((a) => a.textContent === 'Website');
                websiteButtons.forEach((btn) => {
                    const container = btn.closest(s.fallback.container);
                    if (container) {
                        const name = container.querySelector(s.name)?.textContent || '';
                        const rating = container.querySelector(s.rating)?.textContent || '';
                        // Address extraction for fallback
                        const addressSpans = container.querySelectorAll(s.addressSpans);
                        const address = addressSpans.length > 1 ?
                            addressSpans[addressSpans.length - 1].textContent?.trim() : '';
                        const phoneMatch = container.textContent?.match(/(?:\+977|01)[\s.-]?\d{1}[\s.-]?\d{7}|(?:\+\d{1,3})?[\s.-]?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/);
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
        }, sel);
    }
    /**
     * Scrape additional page (for pagination)
     */
    async scrapePage(page, pageNum) {
        try {
            logger.info(`📄 Scraping page ${pageNum + 1}`);
            // Click "Next" button or construct URL for next page
            const nextButtonSelector = selectors.google.pagination.nextButton;
            const nextButton = await page.$(nextButtonSelector);
            if (nextButton) {
                await ghostCursor.moveAndClick(page, nextButtonSelector);
                await page.waitForTimeout(2000);
                return await this.extractLocalPack(page);
            }
            else {
                logger.debug('No more pages to scrape');
                return [];
            }
        }
        catch (error) {
            logger.warn(`Failed to scrape page ${pageNum}: ${error}`);
            return [];
        }
    }
    /**
     * Deduplicate businesses by name (case-insensitive)
     */
    deduplicateBusinesses(businesses) {
        const seen = new Map();
        for (const business of businesses) {
            const key = business.name.toLowerCase().trim();
            if (!seen.has(key)) {
                seen.set(key, business);
            }
            else {
                // Keep the one with more complete data
                const existing = seen.get(key);
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
    getDataCompleteness(business) {
        let score = 0;
        if (business.name)
            score++;
        if (business.address)
            score++;
        if (business.phone)
            score++;
        if (business.website)
            score++;
        if (business.rating)
            score++;
        if (business.hours)
            score++;
        return score;
    }
    /**
     * Generate cache key for scrape request
     */
    generateCacheKey(url) {
        return 'google-scrape:' + createHash('md5').update(url).digest('hex');
    }
}
