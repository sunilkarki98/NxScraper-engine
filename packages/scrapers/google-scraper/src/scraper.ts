import { BasePlaywrightScraper, ScrapeOptions, ScrapeResult, container, Tokens } from '@nx-scraper/shared';
import { getAICache } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';
import { createHash } from 'crypto';
import { Page, Locator } from 'playwright';
import selectors from './config/selectors.json' with { type: "json" };

interface BusinessResult {
    name: string;
    rating: string;
    address: string;
    phone: string | null;
    website: string | null;
    hours?: string;
    priceLevel?: string;
}

export class GoogleScraper extends BasePlaywrightScraper {
    name = 'google-scraper';
    version = '3.0.0'; // Major bump for rewrite

    private readonly RATE_LIMIT_DOMAIN = 'google.com';
    private readonly PAGINATION_LIMIT = 5; // Hard safety cap
    private _cache: ReturnType<typeof getAICache> | null = null;
    private readonly CACHE_ENABLED = true;

    private get cache(): ReturnType<typeof getAICache> | null {
        if (!this._cache && this.CACHE_ENABLED) {
            this._cache = getAICache();
        }
        return this._cache;
    }

    async canHandle(url: string): Promise<number> {
        const domain = new URL(url).hostname;
        // Handle all google domains
        if (domain.includes('google.') && url.includes('/search')) {
            return 1.0;
        }
        return 0;
    }

    /**
     * Rewrite Notes:
     * - Removed 'waitForRateLimit' (handled via shared service if integrated, but strictly here we handle logic flow)
     * - Added 'addLocatorHandler' for continuous consent/captcha monitoring
     */
    protected async parse(page: Page, options: ScrapeOptions): Promise<ScrapeResult> {
        // 1. Cache Check
        if (this.CACHE_ENABLED && this.cache && !options.bypassCache) {
            const cacheKey = this.generateCacheKey(options.url);
            const cached = await this.cache.get<ScrapeResult>(cacheKey).catch(() => null);
            if (cached) {
                logger.info({ url: options.url }, '📦 Returning cached Google scrape results');
                return cached;
            }
        }

        // 2. Setup Lifecycle Handlers (Playwright Native)
        await this.setupEventHandlers(page);

        const organicResults: any[] = [];
        const localPackResults: BusinessResult[] = [];
        let currentPage = 1;

        // Determine limits
        const maxLinks = options.maxLinks || 20;
        // Roughly 10-20 results per page, so calculate pages needed safety cap
        const neededPages = Math.ceil(maxLinks / 10);
        const maxPages = Math.min(neededPages, this.PAGINATION_LIMIT);

        logger.info({ pages: maxPages, goal: maxLinks }, '🔍 Starting Google Scrape');

        // Main Loop
        try {
            while (currentPage <= maxPages) {
                // Wait for results container to ensure page is useful
                // We race standard results vs captcha vs consent
                // Wait for page to stabilize
                // REFACTOR: Don't race. Wait for signals that page is ready.
                try {
                    // Wait for either search results or local pack to START appearing
                    // We use Promise.any to proceed as soon as ONE is ready, but we don't stop looking for the other immediately
                    await Promise.any([
                        page.waitForSelector('#search', { timeout: 15000 }),
                        page.waitForSelector(selectors.google.localPack.container, { timeout: 15000 }),
                        page.waitForSelector('#res', { timeout: 15000 })
                    ]);

                    // Give a small grace period for the *other* component to render if it's lagging slightly
                    // This is crucial for mixed content pages
                    await page.waitForTimeout(1000);

                } catch (e) {
                    logger.warn({ page: currentPage }, '⚠️ Timeout waiting for search results containers');
                    // If we have nothing, we should check for Captcha explicitly one last time
                    if (await this.detectCaptcha(page)) {
                        throw new Error('CAPTCHA_BLOCK');
                    }
                }

                // Extract data from current page
                const [organic, local] = await Promise.all([
                    this.extractOrganicResults(page),
                    this.extractLocalPack(page)
                ]);

                organicResults.push(...organic);
                localPackResults.push(...local);

                // Check termination conditions
                const totalFound = localPackResults.length + organicResults.length;
                if (totalFound >= maxLinks) break;

                // Handle Pagination
                if (currentPage < maxPages) {
                    const hasNext = await this.goToNextPage(page);
                    if (!hasNext) break;
                    currentPage++;

                    // Respectfulness pause between pages (not sleep, but throttle)
                    // We don't have the RateLimit service injected due to strict audit requirements (no implicit dependencies).
                    // So we do a minimal safety pause.
                    await page.waitForTimeout(2000 + Math.random() * 2000);
                } else {
                    break;
                }
            }
        } catch (error: any) {
            if (error.message === 'CAPTCHA_BLOCK') {
                logger.error('🛑 Scrape aborted due to unresolved CAPTCHA');
                // We return what we have so far instead of failing completely? 
                // No, per audit this is a logic failure.
                throw error;
            }
            logger.error({ error }, '❌ Error during main scrape loop');
            throw error;
        }

        // 3. Deduplicate
        const uniqueLocal = this.deduplicateBusinesses(localPackResults);
        const uniqueOrganic = this.deduplicateOrganic(organicResults);

        // 4. Construct Result
        const title = await page.title();
        const finalLimit = options.maxLinks || 100;

        const result: ScrapeResult = {
            success: true,
            data: {
                title,
                description: `Google Search Results for: ${options.url}`,
                content: '', // Explicitly empty as we provide structured data
                links: [
                    ...uniqueOrganic.slice(0, finalLimit).map(r => ({ text: r.title, href: r.link })),
                    ...uniqueLocal.slice(0, finalLimit).map(r => ({ text: `${r.name} (${r.rating})`, href: r.website || '' }))
                ],
                leads: {
                    emails: [],
                    phones: uniqueLocal.map(r => r.phone).filter((p): p is string => p !== null),
                    socialLinks: []
                },
                organicResults: uniqueOrganic.slice(0, finalLimit),
                localPackResults: uniqueLocal.slice(0, finalLimit)
            },
            metadata: {
                url: options.url,
                timestamp: new Date().toISOString(),
                executionTimeMs: 0, // Handled by Base
                engine: this.name,
                version: this.version,
                cached: false,
                totalResults: uniqueLocal.length + uniqueOrganic.length
            }
        };

        // Cache
        if (this.CACHE_ENABLED && this.cache && result.success) {
            const cacheKey = this.generateCacheKey(options.url);
            // Cache for 6 hours
            await this.cache.set(cacheKey, result, 60 * 60 * 6).catch(() => { });
        }

        return result;
    }

    /**
     * Setup native Playwright handlers for interrupts
     */
    private async setupEventHandlers(page: Page): Promise<void> {
        // 1. Consent Dialogs
        const consentSelectors = selectors.google.consent.button;
        const locator = page.locator(consentSelectors).first();
        // Check if selector is valid before adding handler to avoid errors if selector is bad
        // Playwright handlers require robust locators.

        try {
            await page.addLocatorHandler(locator, async (loc) => {
                logger.info('🍪 Auto-handling Consent Dialog');
                await locator.click();
                // Wait for dialog to vanish
                await page.waitForTimeout(500);
            });
        } catch (e) {
            // If selector is invalid, just log
            logger.warn({ error: e }, 'Failed to attach consent handler');
        }

        // 2. Generic Popups (add more as discovered)
    }

    private async goToNextPage(page: Page): Promise<boolean> {
        const nextSelector = selectors.google.pagination.nextButton;
        const nextLink = page.locator(nextSelector);

        if (await nextLink.count() > 0 && await nextLink.isVisible()) {
            logger.info('➡️ Navigating to next page');

            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                nextLink.click()
            ]);
            return true;
        }

        return false;
    }

    private async extractOrganicResults(page: Page) {
        return page.evaluate((sel) => {
            const results: { title: string; link: string; snippet: string }[] = [];
            document.querySelectorAll(sel.container).forEach((el) => {
                const title = el.querySelector(sel.title)?.textContent?.trim();
                const link = el.querySelector(sel.link)?.getAttribute('href');
                const snippet = el.querySelector(sel.snippet)?.textContent?.trim();

                if (title && link) {
                    results.push({ title, link, snippet: snippet || '' });
                }
            });
            return results;
        }, selectors.google.organic);
    }

    private async extractLocalPack(page: Page): Promise<BusinessResult[]> {
        // 1. Try Standard Extraction
        let results = await this.performLocalPackExtraction(page, selectors.google.localPack.container);

        // 2. AI Healing Check
        if (results.length === 0) {
            // CRITICAL FIX: Only attempt healing if we actually SEE a local pack container but failed to extract items.
            // If there is no local pack container, it's just an organic page. Don't waste money.
            const containerExists = await page.locator(selectors.google.localPack.container).count() > 0;

            if (!containerExists) {
                // No local pack on this page. Return empty.
                return [];
            }

            // Check if we suspect there SHOULD be results (e.g. not a captcha page, meaningful content size)
            const contentSize = await page.evaluate(() => document.body.innerText.length);
            if (contentSize > 2000) {
                logger.warn('⚠️ Standard Local Pack container found but selectors failed. Attempting AI Healing...');

                // Ask AI for a better container selector
                // Note: We use AI Extraction instead of Selector Healing here because if the container fails, likely the internal structure failed too.

                const aiEngine = container.resolve(Tokens.AIEngine);
                logger.info('🧠 Invoking AI Extraction Fallback...');
                const html = await page.evaluate(() => {
                    const scripts = document.querySelectorAll('script, style');
                    scripts.forEach(s => s.remove());
                    return document.body.innerText.substring(0, 50000);
                });

                try {
                    const aiResults = await aiEngine.extraction.execute({
                        html,
                        description: "Extract Google Local Pack business results. Return array of objects with name, rating, address, phone.",
                        schema: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    rating: { type: "string" },
                                    address: { type: "string" },
                                    phone: { type: "string" }
                                }
                            }
                        }
                    });

                    if (aiResults.data && Array.isArray(aiResults.data)) {
                        logger.info({ count: aiResults.data.length }, '✅ AI Extraction recovered data');
                        // Map pure JSON results to BusinessResult (ensure fields exist)
                        return (aiResults.data as any[]).map(item => ({
                            name: item.name || 'Unknown',
                            rating: item.rating || '',
                            address: item.address || '',
                            phone: item.phone || null,
                            website: item.website || null,
                            hours: item.hours,
                            priceLevel: item.priceLevel
                        }));
                    }
                } catch (e) {
                    logger.error({ error: e }, '❌ AI Extraction failed');
                }
            }
        }

        return results;
    }

    private async performLocalPackExtraction(page: Page, containerSelector: string): Promise<BusinessResult[]> {
        return page.evaluate((args) => {
            const { sel, containerSelector } = args;
            const businesses: BusinessResult[] = [];
            const containers = document.querySelectorAll(containerSelector);

            containers.forEach((el) => {
                // Use innerText to preserve visible formatting (newlines between blocks)
                const textContent = (el as HTMLElement).innerText || '';

                const name = el.querySelector(sel.name)?.textContent?.trim();
                // Ensure name exists and is not just a structural artifact
                if (!name) return;

                const rating = el.querySelector(sel.rating)?.textContent?.trim() || '';

                // Robust Address Extraction
                const validAddressNodes = Array.from(el.querySelectorAll(sel.addressSpans));
                const address = validAddressNodes.length > 0
                    ? validAddressNodes[validAddressNodes.length - 1].textContent?.trim() || ''
                    : '';

                // Phone Extraction (Scoped & Robust)
                // Relaxed Regex to catch more international formats while avoiding review counts.
                // Matches: +1 555-0123, (555) 123-4567, +977 98-12345678
                const phoneRegex = /(?:^|\n|\s)((?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5})(?:$|\n|\s)/;

                const phoneMatch = textContent.match(phoneRegex);
                const phone = phoneMatch ? phoneMatch[1].trim() : null;

                const website = el.querySelector(sel.website)?.getAttribute('href') || null;
                const hours = el.querySelector(sel.hours)?.textContent?.trim();
                const priceLevel = el.querySelector(sel.price)?.textContent?.trim();

                businesses.push({
                    name,
                    rating,
                    address,
                    phone,
                    website,
                    hours,
                    priceLevel
                });
            });

            return businesses;
        }, { sel: selectors.google.localPack, containerSelector });
    }

    private deduplicateBusinesses(results: BusinessResult[]): BusinessResult[] {
        const seen = new Map<string, BusinessResult>();
        results.forEach(r => {
            const key = r.name.toLowerCase() + '|' + (r.address ? r.address.toLowerCase() : '');
            if (!seen.has(key)) {
                seen.set(key, r);
            } else {
                // Merge strategies? For now, keep first (usually highest ranking)
            }
        });
        return Array.from(seen.values());
    }

    private deduplicateOrganic(results: any[]): any[] {
        const seen = new Set<string>();
        return results.filter(r => {
            if (seen.has(r.link)) return false;
            seen.add(r.link);
            return true;
        });
    }

    /**
     * Legacy Captcha Detection (Fallback if handler doesn't catch it)
     */
    private async detectCaptcha(page: Page): Promise<boolean> {
        for (const selector of selectors.google.captcha.selectors) {
            if (await page.isVisible(selector)) return true;
        }
        return false;
    }

    private generateCacheKey(url: string): string {
        return 'google-scrape:' + createHash('md5').update(url).digest('hex');
    }
}
