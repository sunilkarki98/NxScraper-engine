// Scraper Interface - Contract for all scrapers
export interface ScrapeOptions {
    url: string;
    proxy?: string;
    userAgent?: string;
    timeout?: number;
    waitForSelector?: string;
    screenshot?: boolean;
    bypassCache?: boolean;
    maxLinks?: number;
    returnHtml?: boolean;
    features?: string[];
    metadata?: Record<string, any>;
}

export interface ScrapeResult {
    success: boolean;
    data?: any;
    error?: string;
    metadata: {
        url: string;
        timestamp: string;
        executionTimeMs: number;
        engine?: string;
        proxyUsed?: string;
        retriesAttempted?: number;
        version?: string;
        cached?: boolean;
        totalResults?: number;
    };
}

export interface IScraper {
    /** Unique name for this scraper */
    name: string;

    /** Version of the scraper */
    version: string;

    /** 
     * Determines if this scraper can handle the given URL
     * @returns confidence score 0-1
     */
    canHandle(url: string): Promise<number>;

    /**
     * Performs the actual scraping
     */
    scrape(options: ScrapeOptions): Promise<ScrapeResult>;

    /**
     * Health check for the scraper
     */
    healthCheck(): Promise<boolean>;
}

// Service Interface - For microservice mode
export interface IScraperService {
    baseUrl: string;
    apiKey?: string;

    /**
     * Check if service is available
     */
    ping(): Promise<boolean>;

    /**
     * Request scraping via HTTP
     */
    requestScrape(options: ScrapeOptions): Promise<ScrapeResult>;
}
