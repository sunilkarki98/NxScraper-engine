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
    evasionLevel?: 'low' | 'medium' | 'high';
    metadata?: Record<string, any>;
    scraperType?: string; // Explicitly request a specific scraper
    selectors?: Record<string, string>; // Custom CSS selectors to extract
    actions?: Array<{ type: string;[key: string]: any }>; // Semantic actions
    schema?: any; // AI Structured Extraction Schema
    llmApiKey?: string; // BYO-LLM Support
    description?: string; // Goal description for AI planning
}

export interface ScrapeResult<T = { html?: string; screenshot?: string;[key: string]: any }> {
    success: boolean;
    data?: T;
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
