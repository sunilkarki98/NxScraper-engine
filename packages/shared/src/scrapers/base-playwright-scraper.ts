import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { Page } from 'playwright';
import { container, Tokens } from '../di/container.js';
import { IScraper, ScrapeOptions, ScrapeResult } from '../types/scraper.interface.js';
import logger from '../utils/logger.js';
import {
    activeScrapers,
    scrapeDurationSeconds,
    scrapeErrorsTotal,
    scrapesTotal,
    scrapeErrorsByCategory,
    dataExtractionSuccess,
    dataFieldsExtracted
} from '../observability/metrics.js';
import {
    toApplicationError,
    FailurePoint
} from '../types/errors.js';
import {
    classifyError,
    enhanceErrorContext,
    logClassifiedError
} from '../observability/error-classifier.js';

/**
 * Abstract Base Class for Playwright Scrapers
 * Encapsulates common lifecycle management:
 * - Browser Acquisition/Release
 * - Proxy Selection
 * - Error Handling
 * - Basic Navigation
 */
export abstract class BasePlaywrightScraper implements IScraper {
    abstract name: string;
    abstract version: string;

    /**
     * Determine if this scraper handles the URL
     */
    abstract canHandle(url: string): Promise<number>;

    /**
     * Health Check implementation
     */
    async healthCheck(): Promise<boolean> {
        return true;
    }

    /**
     * Core scraping logic to be implemented by subclasses
     * @param page Playwright Page instance (ready to use)
     * @param options Scrape options
     */
    protected abstract parse(page: Page, options: ScrapeOptions): Promise<ScrapeResult>;

    /**
     * Main entry point
     * Manages the entire lifecycle of the scrape job
     */
    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        const startTime = Date.now();
        let instanceId: string | null = null;
        let page: Page | null = null;
        let proxyUsed: string | undefined;
        let status = 'success';

        // Metrics: Increment active jobs
        activeScrapers.inc({ scraper: this.name });

        try {
            logger.info({ scraper: this.name, url: options.url }, `🚀 Starting scrape`);

            // 1. Proxy Selection
            proxyUsed = await this.selectProxy(options);

            // 2. Acquire Page
            const acquisition = await this.acquirePage(options, proxyUsed);
            page = acquisition.page;
            instanceId = acquisition.instanceId;

            // 3. Navigate
            await this.navigate(page, options.url);

            // 3.1. Apply Evasion (Ghost Protocol)
            const evasionService = container.resolve(Tokens.EvasionService);
            const evasionLevel = options.evasionLevel || ((options as any).stealth ? 'medium' : 'low');

            // Initial behavioral masking
            await evasionService.apply(page, { level: evasionLevel });

            // 3.2. Check for Blocking
            if (options.features?.includes('anti-blocking') || options.evasionLevel === 'high') {
                const blockHandled = await evasionService.handleBlocking(page, options.url);
                if (blockHandled) {
                    logger.info({ scraper: this.name }, '🛡️ BaseScraper: Evasion service handled a block');
                }
            }

            // 3.5. Execute Semantic Actions (Browsing/Navigation)
            if (options.actions && options.actions.length > 0) {
                await this.performActions(page, options.actions);
            }

            // 4. Execute Subclass Logic
            const result = await this.parse(page, options);

            // 5. Enhance Result Metadata
            return {
                ...result,
                metadata: {
                    ...result.metadata,
                    executionTimeMs: Date.now() - startTime,
                    engine: this.name,
                    version: this.version,
                    proxyUsed: proxyUsed,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error: unknown) {
            status = 'failure';

            // Convert to ApplicationError for proper classification
            const appError = toApplicationError(error);
            const classification = classifyError(appError, FailurePoint.SCRAPER_PARSE);

            // Enhance error with scraper context
            const enhancedError = enhanceErrorContext(appError, {
                url: options.url,
                scraper: this.name,
                failurePoint: classification.failurePoint
            });

            // Record comprehensive metrics
            scrapeErrorsTotal.inc({ scraper: this.name, error_type: appError.code });
            scrapeErrorsByCategory.inc({
                category: classification.category,
                scraper: this.name,
                failure_point: classification.failurePoint
            });

            // Log with full classification
            logClassifiedError(enhancedError, {
                scraper: this.name,
                url: options.url,
                proxyUsed,
                classification
            });

            // Record failed data extraction
            dataExtractionSuccess.inc({ scraper: this.name, data_quality: 'empty' });

            return {
                success: false,
                error: enhancedError.message,
                errorCode: appError.code,
                errorCategory: classification.category,
                failurePoint: classification.failurePoint,
                retryable: appError.retryable,
                metadata: {
                    url: options.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: Date.now() - startTime,
                    engine: this.name,
                    proxyUsed: proxyUsed
                }
            };
        } finally {
            // Metrics: Record Duration and Total
            const duration = (Date.now() - startTime) / 1000;
            scrapeDurationSeconds.observe({ scraper: this.name, status }, duration);
            scrapesTotal.inc({ scraper: this.name, status });
            activeScrapers.dec({ scraper: this.name });

            // 6. Resource Cleanup
            if (page && instanceId) {
                await this.releasePage(instanceId, page);
            }
        }
    }

    /**
     * Select best proxy for the job
     */
    protected async selectProxy(options: ScrapeOptions): Promise<string | undefined> {
        const { proxyManager } = await import('../services/proxy-manager.js');
        const adaptiveProxy = await proxyManager.getBestProxyForUrl(options.url);

        if (adaptiveProxy) {
            logger.debug({ proxy: adaptiveProxy }, '🧠 ProxyManager selected optimized proxy');
            return adaptiveProxy;
        }

        return options.proxy;
    }

    /**
     * Acquire page from BrowserPool
     */
    protected async acquirePage(options: ScrapeOptions, proxyUrl?: string): Promise<{ page: Page; instanceId: string }> {
        const browserPool = container.resolve(Tokens.BrowserPool);

        // Map "stealth" option if present in subclass specific options
        const useStealth = (options as any).stealth === true || (options as any).features?.includes('stealth');

        const result = await browserPool.acquirePage({
            engine: 'playwright',
            headless: true, // Always headless for now, could be configurable
            proxy: proxyUrl,
            stealth: useStealth,
            userAgent: options.userAgent,
            wsEndpoint: process.env.BROWSER_WS_ENDPOINT
        });

        if (!result.page || !result.instanceId) {
            throw new Error('Failed to acquire page from BrowserPool');
        }

        return {
            page: result.page as Page,
            instanceId: result.instanceId
        };
    }

    /**
     * Safe Navigation with Timeout
     */
    protected async navigate(page: Page, url: string, timeout = 30000): Promise<void> {
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({
                url,
                timeout,
                error: err.message,
                stack: err.stack
            }, '❌ Navigation failed');
            throw new Error(`Navigation failed to ${url}: ${err.message}`);
        }
    }

    /**
     * Release page back to pool
     */
    protected async releasePage(instanceId: string, page: Page): Promise<void> {
        try {
            const browserPool = container.resolve(Tokens.BrowserPool);
            await browserPool.releasePage(instanceId, page);
        } catch (error) {
            logger.warn({ error }, 'Failed to release page back to pool');
        }
    }

    /**
     * AI Intelligence Service
     * Provides self-healing and advanced capabilities
     */
    protected get intelligence() {
        const { scraperIntelligence } = require('../services/scraper-intelligence.js');
        return scraperIntelligence;
    }

    /**
     * Execute a sequence of semantic actions
     */
    protected async performActions(page: Page, actions: Array<{ type: string;[key: string]: any }>): Promise<void> {
        logger.info({ actions: actions.length }, '🤖 Executing interaction plan');

        for (const action of actions) {
            try {
                logger.debug({ action }, '👉 Performing action');

                switch (action.type) {
                    case 'click':
                        if (action.selector) {
                            // 🧠 UPGRADE: Use Self-Healing Click
                            const locator = await this.intelligence.safeLocate(page, action.selector, 'Click Target');
                            if (locator) {
                                await locator.click();
                            } else {
                                throw new Error(`Could not locate element: ${action.selector}`);
                            }
                        }
                        break;

                    case 'wait':
                        if (action.duration || action.ms) {
                            await page.waitForTimeout(action.duration || action.ms || 1000);
                        } else if (action.selector) {
                            await page.waitForSelector(action.selector);
                        }
                        break;

                    case 'fill':
                    case 'type':
                        if (action.selector && action.value) {
                            // 🧠 UPGRADE: Use Self-Healing Fill
                            const locator = await this.intelligence.safeLocate(page, action.selector, 'Input Field');
                            if (locator) {
                                await locator.fill(action.value);
                            } else {
                                throw new Error(`Could not locate element: ${action.selector}`);
                            }
                        }
                        break;

                    case 'scroll':
                        if (action.selector) {
                            await page.locator(action.selector).scrollIntoViewIfNeeded();
                        } else {
                            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                        }
                        break;

                    case 'hover':
                        if (action.selector) {
                            await page.hover(action.selector);
                        }
                        break;

                    case 'screenshot':
                        // Handled by generic options, but can be explicit here too
                        break;

                    default:
                        logger.warn({ type: action.type }, 'Unknown action type');
                }
            } catch (error: any) {
                logger.error({ error, action }, 'Action failed, continuing...');
            }
        }
    }
}
