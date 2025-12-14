import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginManager } from '@core/plugins/plugin-manager';
import type { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared/types/scraper.interface';

vi.mock('@nx-scraper/shared', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

describe('PluginManager', () => {
    let pluginManager: PluginManager;
    let mockScraper1: IScraper;
    let mockScraper2: IScraper;

    beforeEach(() => {
        // Create fresh instance for each test
        pluginManager = new PluginManager();

        // Create mock scrapers
        mockScraper1 = {
            name: 'test-scraper-1',
            version: '1.0.0',
            canHandle: vi.fn(),
            scrape: vi.fn(),
            healthCheck: vi.fn()
        };

        mockScraper2 = {
            name: 'test-scraper-2',
            version: '2.0.0',
            canHandle: vi.fn(),
            scrape: vi.fn(),
            healthCheck: vi.fn()
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('register', () => {
        it('should register a scraper successfully', () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');

            const scrapers = pluginManager.getAll();
            expect(scrapers).toHaveLength(1);
            expect(scrapers[0]).toBe(mockScraper1);
        });

        it('should register multiple scrapers', () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');

            const scrapers = pluginManager.getAll();
            expect(scrapers).toHaveLength(2);
        });

        it('should overwrite scraper with same name', () => {
            const updatedScraper = { ...mockScraper1, version: '1.1.0' };

            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(updatedScraper, 'path/to/s1', 'Scraper1');

            const scrapers = pluginManager.getAll();
            expect(scrapers).toHaveLength(1);
            expect(scrapers[0].version).toBe('1.1.0');
        });
    });

    describe('unregister', () => {
        it('should remove a registered scraper', () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');

            const result = pluginManager.unregister('test-scraper-1');

            expect(result).toBe(true);
            expect(pluginManager.getAll()).toHaveLength(0);
        });

        it('should return false for non-existent scraper', () => {
            const result = pluginManager.unregister('non-existent');

            expect(result).toBe(false);
        });

        it('should not affect other scrapers', () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');

            pluginManager.unregister('test-scraper-1');

            const scrapers = pluginManager.getAll();
            expect(scrapers).toHaveLength(1);
            expect(scrapers[0].name).toBe('test-scraper-2');
        });
    });

    describe('getAll', () => {
        it('should return empty array when no scrapers registered', () => {
            expect(pluginManager.getAll()).toEqual([]);
        });

        it('should return all registered scrapers', () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');

            const scrapers = pluginManager.getAll();
            expect(scrapers).toHaveLength(2);
            expect(scrapers).toContain(mockScraper1);
            expect(scrapers).toContain(mockScraper2);
        });
    });

    describe('getScraperByName', () => {
        beforeEach(() => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');
        });

        it('should return scraper by exact name', () => {
            const scraper = pluginManager.getScraperByName('test-scraper-1');
            expect(scraper).toBe(mockScraper1);
        });

        it('should return undefined for non-existent scraper', () => {
            const scraper = pluginManager.getScraperByName('non-existent');
            expect(scraper).toBeUndefined();
        });

        it('should be case-sensitive', () => {
            const scraper = pluginManager.getScraperByName('TEST-SCRAPER-1');
            expect(scraper).toBeUndefined();
        });
    });

    describe('findBestScraper', () => {
        beforeEach(() => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');
        });

        it('should return scraper with highest confidence score', async () => {
            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0.7);
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0.9);

            const result = await pluginManager.findBestScraper('https://example.com');

            expect(result).toBe(mockScraper2);
            expect(mockScraper1.canHandle).toHaveBeenCalledWith('https://example.com');
            expect(mockScraper2.canHandle).toHaveBeenCalledWith('https://example.com');
        });

        it('should return null if no scraper can handle URL', async () => {
            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0);
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0);

            const result = await pluginManager.findBestScraper('https://example.com');

            expect(result).toBeNull();
        });

        it('should handle scraper errors gracefully', async () => {
            vi.mocked(mockScraper1.canHandle).mockRejectedValue(new Error('Scraper error'));
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0.8);

            const result = await pluginManager.findBestScraper('https://example.com');

            // Should still return scraper2 despite scraper1 error
            expect(result).toBe(mockScraper2);
        });

        it('should return first scraper if multiple have same score', async () => {
            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0.8);
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0.8);

            const result = await pluginManager.findBestScraper('https://example.com');

            // Should return first one encountered with highest score
            expect(result).toBeTruthy();
            expect([mockScraper1, mockScraper2]).toContain(result);
        });

        it('should return null when no scrapers registered', async () => {
            const emptyManager = new PluginManager();

            const result = await emptyManager.findBestScraper('https://example.com');

            expect(result).toBeNull();
        });
    });

    describe('scrape', () => {
        const mockOptions: ScrapeOptions = {
            url: 'https://example.com',
            maxLinks: 10
        };

        beforeEach(() => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');
        });

        it('should execute scrape with best matched scraper', async () => {
            const mockResult: ScrapeResult = {
                success: true,
                data: { title: 'Test Page' },
                metadata: {
                    url: mockOptions.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: 100
                }
            };

            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0.9);
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0.5);
            vi.mocked(mockScraper1.scrape).mockResolvedValue(mockResult);

            const result = await pluginManager.scrape(mockOptions);

            expect(result).toEqual(mockResult);
            expect(mockScraper1.scrape).toHaveBeenCalledWith(mockOptions);
            expect(mockScraper2.scrape).not.toHaveBeenCalled();
        });

        it('should return error when no scraper can handle URL', async () => {
            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0);
            vi.mocked(mockScraper2.canHandle).mockResolvedValue(0);

            const result = await pluginManager.scrape(mockOptions);

            expect(result.success).toBe(false);
            expect(result.error).toBe('No scraper available for this URL');
            expect(result.metadata.url).toBe(mockOptions.url);
        });

        it('should propagate scraper errors', async () => {
            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0.9);
            vi.mocked(mockScraper1.scrape).mockRejectedValue(new Error('Scrape failed'));

            await expect(pluginManager.scrape(mockOptions)).rejects.toThrow('Scrape failed');
        });
    });

    describe('healthCheck', () => {
        it('should return health status for all scrapers', async () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');

            vi.mocked(mockScraper1.healthCheck).mockResolvedValue(true);
            vi.mocked(mockScraper2.healthCheck).mockResolvedValue(true);

            const result = await pluginManager.healthCheck();

            expect(result).toEqual({
                'test-scraper-1': true,
                'test-scraper-2': true
            });
        });

        it('should handle failing health checks', async () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');
            pluginManager.register(mockScraper2, 'path/to/s2', 'Scraper2');

            vi.mocked(mockScraper1.healthCheck).mockResolvedValue(false);
            vi.mocked(mockScraper2.healthCheck).mockResolvedValue(true);

            const result = await pluginManager.healthCheck();

            expect(result).toEqual({
                'test-scraper-1': false,
                'test-scraper-2': true
            });
        });

        it('should mark scraper as unhealthy if healthCheck throws', async () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');

            vi.mocked(mockScraper1.healthCheck).mockRejectedValue(new Error('Health check error'));

            const result = await pluginManager.healthCheck();

            expect(result['test-scraper-1']).toBe(false);
        });

        it('should return empty object when no scrapers registered', async () => {
            const result = await pluginManager.healthCheck();

            expect(result).toEqual({});
        });
    });

    describe('edge cases', () => {
        it('should handle registering scraper with special characters in name', () => {
            const specialScraper = {
                ...mockScraper1,
                name: 'test-scraper-@#$%'
            };

            pluginManager.register(specialScraper, 'path/to/s3', 'ScraperSpecial');

            expect(pluginManager.getScraperByName('test-scraper-@#$%')).toBe(specialScraper);
        });

        it('should handle concurrent scrape operations', async () => {
            pluginManager.register(mockScraper1, 'path/to/s1', 'Scraper1');

            vi.mocked(mockScraper1.canHandle).mockResolvedValue(0.9);
            vi.mocked(mockScraper1.scrape).mockResolvedValue({
                success: true,
                data: {},
                metadata: { url: 'https://example.com', timestamp: new Date().toISOString(), executionTimeMs: 100 }
            });

            const operations = [
                pluginManager.scrape({ url: 'https://example1.com' }),
                pluginManager.scrape({ url: 'https://example2.com' }),
                pluginManager.scrape({ url: 'https://example3.com' })
            ];

            const results = await Promise.all(operations);

            expect(results).toHaveLength(3);
            expect(results.every(r => r.success)).toBe(true);
        });
    });
});
