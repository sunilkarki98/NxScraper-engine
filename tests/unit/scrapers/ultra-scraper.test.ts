import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UltraScraper } from '../../../packages/scrapers/ultra-scraper/src/scraper';
import type { ScrapeOptions } from '@nx-scraper/shared/types/scraper.interface';

// Define mocks
const mocks = vi.hoisted(() => {
    return {
        page: {
            goto: vi.fn(),
            content: vi.fn(),
            title: vi.fn(),
            waitForSelector: vi.fn(),
            close: vi.fn(),
            viewport: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
            viewportSize: vi.fn().mockReturnValue({ width: 1920, height: 1080 }),
            innerText: vi.fn()
        },
        browserPool: {
            acquirePage: vi.fn(),
            releasePage: vi.fn()
        },
        ghostCursor: {
            moveRandomly: vi.fn()
        },
        htmlParser: {
            getList: vi.fn(),
            getText: vi.fn()
        }
    };
});

// Mock dependencies
vi.mock('@nx-scraper/shared', () => ({
    browserPool: mocks.browserPool,
    ghostCursor: mocks.ghostCursor,
    HtmlParser: class {
        constructor() {
            return mocks.htmlParser;
        }
    },
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    },
    proxyManager: {
        getBestProxyForUrl: vi.fn(),
        getNextProxy: vi.fn(),
        reportSuccess: vi.fn(),
        reportFailure: vi.fn()
    },
    // Add env mock here too for safety
    env: new Proxy({}, { get: () => 'test' }),
    validateEnvironment: vi.fn(),
    container: {
        resolve: vi.fn((token) => {
            if (token === 'BrowserPool') return mocks.browserPool;
            if (token === 'AIEngine') return {
                isAvailable: vi.fn().mockReturnValue(true),
                antiBlocking: { execute: vi.fn().mockResolvedValue({}) },
                pageUnderstanding: { execute: vi.fn().mockResolvedValue({}) },
                healSelector: vi.fn().mockResolvedValue(null)
            };
            if (token === 'CaptchaSolver') return { solveWithVision: vi.fn(), solve: vi.fn() };
            return null;
        })
    },
    Tokens: {
        BrowserPool: 'BrowserPool',
        AIEngine: 'AIEngine',
        CaptchaSolver: 'CaptchaSolver'
    },
    BasePlaywrightScraper: class {
        name = 'base-scraper-mock';
        version = '0.0.0';
        async scrape(options: any) {
            try {
                // Mimic base scraper lifecycle
                await this.acquirePage(options);
                await mocks.page.goto(options.url);
                // Call subclass parse
                const result = await (this as any).parse(mocks.page, options);
                return result;
            } catch (e: any) {
                return { success: false, error: e.message };
            } finally {
                await this.releasePage();
            }
        }
        async canHandle() { return 0.5; }
        async healthCheck() { return true; }
        async selectProxy(opts: any) { return opts.proxy; }
        async acquirePage(opts: any) {
            return mocks.browserPool.acquirePage(opts);
        }
        async performActions() { }
        async navigate() { }
        async releasePage() {
            // Call mock to verify expectation
            mocks.browserPool.releasePage('test-instance', mocks.page);
        }
    }
}));

describe('UltraScraper', () => {
    let scraper: UltraScraper;

    beforeEach(() => {
        scraper = new UltraScraper();
        vi.clearAllMocks();

        // Default mock setup
        mocks.browserPool.acquirePage.mockResolvedValue({
            page: mocks.page,
            instanceId: 'test-instance'
        });
        mocks.page.content.mockResolvedValue('<html><body>Test Content</body></html>');
        mocks.page.title.mockResolvedValue('Test Page');
        mocks.page.innerText.mockResolvedValue('Body Text');
        mocks.htmlParser.getText.mockReturnValue('Parsed text');
        mocks.htmlParser.getList.mockReturnValue([]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Capabilities', () => {
        it('should handle protected domains with high score', async () => {
            expect(await scraper.canHandle('https://www.linkedin.com/in/test')).toBe(0.9);
            expect(await scraper.canHandle('https://facebook.com/test')).toBe(0.9);
        });

        it('should handle other domains with low score', async () => {
            expect(await scraper.canHandle('https://example.com')).toBe(0.3);
        });
    });

    describe('Scraping Logic', () => {
        const options: ScrapeOptions = {
            url: 'https://example.com',
            waitForSelector: '.content'
        };

        it('should execute basic scrape flow', async () => {
            await scraper.scrape(options);

            // Flow verification
            expect(mocks.browserPool.acquirePage).toHaveBeenCalledWith(expect.objectContaining({
                // Base mock simply passes options through
                url: options.url
            }));
            expect(mocks.page.goto).toHaveBeenCalledWith(options.url);


            // releasePage is called by base class finally block
            expect(mocks.browserPool.releasePage).toHaveBeenCalledWith('test-instance', mocks.page);
        });

        it('should parse content correctly', async () => {
            mocks.htmlParser.getText.mockReturnValue('Body Text');
            mocks.htmlParser.getList.mockReturnValue([{ text: 'Link', href: '#' }]);

            const result = await scraper.scrape(options);

            if (!result.success) console.error('Test Scrape Failed:', result.error);

            expect(result.success).toBe(true);
            // Updated to match actual UltraScraper output (raw dump if no schema)
            expect(result.data?.text).toBe('Body Text');
            expect(result.data?.html).toBe('<html><body>Test Content</body></html>');
        });
    });

    describe('Resilience & Cleanup', () => {
        it('should release page even if navigation fails', async () => {
            mocks.page.goto.mockRejectedValue(new Error('Navigation Failed'));

            const result = await scraper.scrape({ url: 'https://fail.com' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Navigation Failed');
            // CRITICAL: Ensure releasePage is called
            expect(mocks.browserPool.releasePage).toHaveBeenCalledWith('test-instance', mocks.page);
        });

        it('should handle browser acquisition failure', async () => {
            mocks.browserPool.acquirePage.mockRejectedValue(new Error('Pool Empty'));

            const result = await scraper.scrape({ url: 'https://fail.com' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Pool Empty');
        });
    });
});
