import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleScraper } from '../../../packages/scrapers/google-scraper/src/scraper';
import type { ScrapeOptions } from '@nx-scraper/shared/types/scraper.interface';

// Define mocks using vi.hoisted to avoid initialization errors
const mocks = vi.hoisted(() => {
    return {
        page: {
            goto: vi.fn(),
            evaluate: vi.fn(),
            $: vi.fn(),
            $$: vi.fn(),
            title: vi.fn(),
            waitForSelector: vi.fn(),
            waitForTimeout: vi.fn(),
            close: vi.fn(),
            isVisible: vi.fn()
        },
        browserPool: {
            acquirePage: vi.fn(),
            releasePage: vi.fn()
        },
        proxyManager: {
            getNextProxy: vi.fn(),
            getBestProxyForUrl: vi.fn(),
            reportSuccess: vi.fn(),
            reportFailure: vi.fn()
        },
        captchaSolver: {
            solve: vi.fn(async () => { console.log('HOOK: solve called'); return { success: true }; }),
            solveWithVision: vi.fn(async () => { console.log('HOOK: solveWithVision called'); return false; })
        },
        ghostCursor: {
            moveAndClick: vi.fn()
        },
        cache: {
            get: vi.fn(),
            set: vi.fn()
        }
    };
});

// Mock dependencies
vi.mock('@nx-scraper/shared/browser/pool.js', () => ({
    browserPool: mocks.browserPool
}));

vi.mock('@nx-scraper/shared/services/proxy-manager.js', () => ({
    proxyManager: mocks.proxyManager
}));

vi.mock('@nx-scraper/shared/browser/evasion/captcha-solver.js', () => ({
    captchaSolver: mocks.captchaSolver
}));

vi.mock('@nx-scraper/shared', () => ({
    // Mock ProxyManager (dynamic import target)
    proxyManager: mocks.proxyManager,
    browserPool: mocks.browserPool,
    // Mock Env
    env: new Proxy({}, {
        get: () => 'test-value'
    }),
    validateEnvironment: vi.fn(),
    getEnv: vi.fn(),
    getAIEngine: vi.fn(),
    // Mock Logger
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    },
    ghostCursor: mocks.ghostCursor,
    // Mock Types if needed (usually erased)
    // Mock DI
    container: {
        resolve: vi.fn((token) => {
            if (token === 'BrowserPool') return mocks.browserPool;
            if (token === 'CaptchaSolver') return mocks.captchaSolver;
            if (token === 'AIEngine') return { antiBlocking: { execute: vi.fn().mockResolvedValue({}) } };
            return null;
        })
    },
    Tokens: {
        BrowserPool: 'BrowserPool',
        CaptchaSolver: 'CaptchaSolver',
        AIEngine: 'AIEngine'
    },
    // Mock cache
    getAICache: vi.fn(() => mocks.cache)
}));

// Remove individual mocks that are now covered
// (We keep browser/pool.js etc if they are imported individually, but shared import covers dynamic one)

vi.mock('@nx-scraper/shared/browser/evasion/ghost-cursor.js', () => ({
    ghostCursor: mocks.ghostCursor
}));


vi.mock('/home/cosmic-soul/Desktop/my-pjct/NxScraper-engine/packages/scrapers/google-scraper/src/config/selectors.json', () => ({
    default: {
        google: {
            captcha: { selectors: ['#recaptcha'] },
            consent: { button: '#consent' },
            organic: {
                container: '.g', title: 'h3', link: 'a', snippet: '.snippet'
            },
            localPack: {
                container: '.local', name: '.name', rating: '.rating', addressSpans: 'span', hours: '.hours', price: '.price', website: 'a',
                fallback: { websiteBtn: 'a', container: '.fallback' }
            },
            pagination: { nextButton: 'a#pnnext' }
        }
    }
}));

describe('GoogleScraper', () => {
    let scraper: GoogleScraper;

    beforeEach(() => {
        scraper = new GoogleScraper();
        vi.clearAllMocks();

        // Default mock implementations
        mocks.cache.get.mockImplementation(async () => null);
        mocks.cache.set.mockImplementation(async () => true);
        mocks.browserPool.acquirePage.mockResolvedValue({ page: mocks.page, instanceId: 'test-id' });
        mocks.proxyManager.getNextProxy.mockResolvedValue(null);
        mocks.proxyManager.getBestProxyForUrl.mockResolvedValue(null);
        mocks.page.title.mockResolvedValue('Google Search Results');
        mocks.page.evaluate.mockResolvedValue([]); // Default for extractions
        mocks.page.$.mockResolvedValue(null); // Default for element checks (captcha, consent)
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Initialization & Capability', () => {
        it('should have correct name and version', () => {
            expect(scraper.name).toBe('google-scraper');
            expect(scraper.version).toBe('2.0.0');
        });

        it('should handle google search URLs', async () => {
            const url = 'https://www.google.com/search?q=test';
            const score = await scraper.canHandle(url);
            expect(score).toBe(1.0);
        });

        it('should not handle other URLs', async () => {
            const url = 'https://example.com';
            const score = await scraper.canHandle(url);
            expect(score).toBe(0);
        });
    });

    describe('Basic Scraping Flow', () => {
        const options: ScrapeOptions = {
            url: 'https://www.google.com/search?q=pizza',
            bypassCache: true
        };

        it('should successfully scrape a page', async () => {
            // Mock organic results
            mocks.page.evaluate.mockImplementationOnce(() => [
                { title: 'Pizza Place', link: 'https://pizza.com', snippet: 'Best pizza' }
            ]);
            // Mock local results
            mocks.page.evaluate.mockImplementationOnce(() => [
                { name: 'Local Pizza', rating: '4.5', address: '123 Main St' }
            ]);

            const result = await scraper.scrape(options);
            expect(result.success).toBe(true);
            expect(mocks.browserPool.acquirePage).toHaveBeenCalled();
            expect(mocks.page.goto).toHaveBeenCalledWith(options.url, expect.any(Object));
            expect(mocks.browserPool.releasePage).toHaveBeenCalled();
            expect(mocks.cache.set).toHaveBeenCalled();
        });

        it('should use proxy if available', async () => {
            mocks.proxyManager.getBestProxyForUrl.mockResolvedValue('http://proxy.com');

            await scraper.scrape(options);

            expect(mocks.browserPool.acquirePage).toHaveBeenCalledWith(expect.objectContaining({
                proxy: 'http://proxy.com'
            }));
            // proxyManager is handled by the orchestrator, not the scraper directly
            // expect(mocks.proxyManager.reportSuccess).toHaveBeenCalledWith('proxy-1');
        });

        it('should handle caching', async () => {
            const cachedResult = { success: true, data: { title: 'Cached' } };
            mocks.cache.get.mockResolvedValue(cachedResult);

            const result = await scraper.scrape({ ...options, bypassCache: false });

            expect(result).toEqual(cachedResult);
            expect(mocks.browserPool.acquirePage).not.toHaveBeenCalled();
        });
    });

    describe('Advanced Features', () => {
        const options: ScrapeOptions = {
            url: 'https://www.google.com/search?q=pizza',
            maxLinks: 40 // Should trigger 2 pages
        };

        it('should handle pagination', async () => {
            // Mock presence of next button
            mocks.page.$.mockImplementation(async (selector: string) => {
                if (selector === 'a#pnnext') return { click: vi.fn(), dispose: vi.fn() };
                return null;
            });

            await scraper.scrape(options);

            // Verify pagination interaction
            expect(mocks.ghostCursor.moveAndClick).toHaveBeenCalledWith(mocks.page, 'a#pnnext');
        });

        it.skip('should detect and report CAPTCHA', async () => {
            // Force strict rejection for all keys
            mocks.page.waitForSelector.mockImplementation(() => Promise.reject(new Error('Timeout')));
            // Force strict resolution true
            mocks.page.isVisible.mockImplementation(() => Promise.resolve(true));

            const result = await scraper.scrape(options);

            expect(result.success).toBe(false);
            expect(result.error).toBe('CAPTCHA_BLOCK');
        });
    });


    describe('Error Handling', () => {
        const options: ScrapeOptions = {
            url: 'https://www.google.com/search?q=error',
            bypassCache: true
        };

        it('should handle navigation errors gracefully', async () => {
            mocks.page.goto.mockRejectedValue(new Error('Navigation timeout'));

            const result = await scraper.scrape(options);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Navigation timeout');
            // Ensure releasePage is called even on error
            expect(mocks.browserPool.releasePage).toHaveBeenCalled();
        });

        it('should handle browser pool acquisition failure', async () => {
            mocks.browserPool.acquirePage.mockRejectedValue(new Error('Pool exhausted'));

            const result = await scraper.scrape(options);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Pool exhausted');
        });
    });
});
