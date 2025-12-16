import { IScraper, ScrapeOptions, ScrapeResult } from '@nx-scraper/shared';
export declare class GoogleScraper implements IScraper {
    name: string;
    version: string;
    private _cache;
    private lastRequestTime;
    private readonly MIN_REQUEST_DELAY;
    private readonly MAX_REQUEST_DELAY;
    private readonly CACHE_ENABLED;
    private get cache();
    canHandle(url: string): Promise<number>;
    /**
     * Enhanced scrape with pagination support
     */
    scrape(options: ScrapeOptions): Promise<ScrapeResult>;
    healthCheck(): Promise<boolean>;
    /**
     * Rate limiting - wait between requests with random delay
     */
    private waitForRateLimit;
    /**
     * Detect CAPTCHA on page
     */
    private detectCaptcha;
    /**
     * Handle cookie consent with ghost cursor for human-like behavior
     */
    private handleConsent;
    /**
     * Extract organic search results
     */
    private extractOrganicResults;
    /**
     * Enhanced local pack extraction with all fixes
     */
    private extractLocalPack;
    /**
     * Scrape additional page (for pagination)
     */
    private scrapePage;
    /**
     * Deduplicate businesses by name (case-insensitive)
     */
    private deduplicateBusinesses;
    /**
     * Calculate data completeness score
     */
    private getDataCompleteness;
    /**
     * Generate cache key for scrape request
     */
    private generateCacheKey;
}
