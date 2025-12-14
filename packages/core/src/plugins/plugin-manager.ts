import { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
import { logger } from '@nx-scraper/shared';

export interface ScraperMetadata {
    instance: IScraper;
    packagePath: string;
    className: string;
}

/**
 * Plugin Manager
 * Dynamically loads and manages scraper plugins
 */
export class PluginManager {
    private scrapers: Map<string, ScraperMetadata> = new Map();

    /**
     * Register a scraper plugin
     */
    register(scraper: IScraper, packagePath: string, className: string): void {
        logger.info(`Registering scraper plugin: ${scraper.name} v${scraper.version}`);
        this.scrapers.set(scraper.name, { instance: scraper, packagePath, className });
    }

    /**
     * Unregister a scraper
     */
    unregister(name: string): boolean {
        return this.scrapers.delete(name);
    }

    /**
     * Get all registered scrapers
     */
    getAll(): IScraper[] {
        return Array.from(this.scrapers.values()).map(m => m.instance);
    }

    /**
     * Get a scraper by name
     */
    getScraperByName(name: string): IScraper | undefined {
        return this.scrapers.get(name)?.instance;
    }

    /**
     * Get scraper metadata by name
     */
    getMetadata(name: string): ScraperMetadata | undefined {
        return this.scrapers.get(name);
    }

    /**
     * Find the best scraper for a URL
     * @returns The scraper with highest confidence score
     */
    async findBestScraper(url: string): Promise<IScraper | null> {
        let bestScraper: IScraper | null = null;
        let highestScore = 0;

        for (const meta of this.scrapers.values()) {
            const scraper = meta.instance;
            try {
                const score = await scraper.canHandle(url);

                if (score > highestScore) {
                    highestScore = score;
                    bestScraper = scraper;
                }
            } catch (error) {
                logger.error(error, `Error checking ${scraper.name} for URL ${url}:`);
            }
        }

        return highestScore > 0 ? bestScraper : null;
    }

    /**
     * Execute scraping with the best available scraper
     */
    async scrape(options: ScrapeOptions): Promise<ScrapeResult> {
        const scraper = await this.findBestScraper(options.url);

        if (!scraper) {
            return {
                success: false,
                error: 'No scraper available for this URL',
                metadata: {
                    url: options.url,
                    timestamp: new Date().toISOString(),
                    executionTimeMs: 0
                }
            };
        }

        logger.info(`Using scraper: ${scraper.name} for ${options.url}`);
        return scraper.scrape(options);
    }

    /**
     * Health check for all scrapers
     */
    async healthCheck(): Promise<Record<string, boolean>> {
        const results: Record<string, boolean> = {};

        for (const [name, meta] of this.scrapers) {
            try {
                results[name] = await meta.instance.healthCheck();
            } catch {
                results[name] = false;
            }
        }

        return results;
    }
}

// Singleton instance
export const pluginManager = new PluginManager();
