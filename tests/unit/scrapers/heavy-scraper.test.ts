import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeavyScraper } from '../../../packages/scrapers/heavy-scraper/src/scraper';
import type { ScrapeOptions } from '@nx-scraper/shared/types/scraper.interface';

// Define mocks
const mocks = vi.hoisted(() => {
    return {
        page: {
            goto: vi.fn(),
            content: vi.fn(),
            title: vi.fn(),
            waitForSelector: vi.fn(),
            close: vi.fn()
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
vi.mock('@nx-scraper/shared/browser/pool.js', () => ({
    browserPool: mocks.browserPool
}));

vi.mock('@nx-scraper/shared/browser/evasion/ghost-cursor.js', () => ({
    ghostCursor: mocks.ghostCursor
}));

vi.mock('@nx-scraper/shared/utils/html-parser.js', () => ({
    HtmlParser: class {
        constructor() {
            return mocks.htmlParser;
        }
    }
}));

describe('HeavyScraper', () => {
    let scraper: HeavyScraper;

    beforeEach(() => {
        scraper = new HeavyScraper();
        vi.clearAllMocks();

        // Default mock setup
        mocks.browserPool.acquirePage.mockResolvedValue({
            page: mocks.page,
            instanceId: 'test-instance'
        });
        mocks.page.content.mockResolvedValue('<html><body>Test Content</body></html>');
        mocks.page.title.mockResolvedValue('Test Page');
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
                engine: 'puppeteer',
                stealth: true
            }));
            expect(mocks.page.goto).toHaveBeenCalledWith(options.url, expect.any(Object));
            expect(mocks.ghostCursor.moveRandomly).toHaveBeenCalledWith(mocks.page);
            expect(mocks.page.waitForSelector).toHaveBeenCalledWith('.content', expect.any(Object));
            expect(mocks.browserPool.releasePage).toHaveBeenCalledWith('test-instance', mocks.page);
        });

        it('should parse content correctly', async () => {
            mocks.htmlParser.getText.mockReturnValue('Body Text');
            mocks.htmlParser.getList.mockReturnValue([{ text: 'Link', href: '#' }]);

            const result = await scraper.scrape(options);

            if (!result.success) console.error('Test Scrape Failed:', result.error);

            expect(result.success).toBe(true);
            expect(result.data.content).toBe('Body Text');
            expect(result.data.links).toHaveLength(1);
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
