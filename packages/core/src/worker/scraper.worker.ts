import { validateEnvironment, dragonfly, type WorkerMessage, type ScrapeResult, type ScraperPlugin } from '@nx-scraper/shared';

// Initialize environment
validateEnvironment();

// Bootstrap DI
import { bootstrapDI } from '../di/bootstrap.js';
await bootstrapDI();

/**
 * Worker-local context to avoid shared mutable state
 * Each worker thread gets its own instance
 */
class WorkerContext {
    private loadedScrapers = new Map<string, new () => ScraperPlugin>();

    async loadScraper(packagePath: string, className: string): Promise<ScraperPlugin> {
        // Check cache first
        let ScraperClass = this.loadedScrapers.get(packagePath);

        if (!ScraperClass) {
            try {
                // Try direct import first (e.g. strict path or local alias)
                let module: any;
                try {
                    module = await import(packagePath);
                } catch (e) {
                    // Fallback: Try scoped package import
                    if (!packagePath.startsWith('@')) {
                        try {
                            module = await import(`@nx-scraper/${packagePath}`);
                        } catch (e2) {
                            throw e; // Throw original error if both fail
                        }
                    } else {
                        throw e;
                    }
                }

                const FoundClass = module[className];

                if (!FoundClass) {
                    // Try looking for default export or finding class by name in exports
                    if (module.default && module.default.name === className) {
                        ScraperClass = module.default as new () => ScraperPlugin;
                    } else {
                        throw new Error(`Class ${className} not found in ${packagePath}`);
                    }
                } else {
                    ScraperClass = FoundClass as new () => ScraperPlugin;
                }

                // Cache for reuse within this worker
                this.loadedScrapers.set(packagePath, ScraperClass);
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                throw new Error(`Failed to load scraper: ${err.message}`);
            }
        }

        if (!ScraperClass) {
            throw new Error(`Failed to load scraper class ${className}`);
        }

        return new ScraperClass();
    }
}

// Create worker-local context (one per worker thread)
const workerContext = new WorkerContext();

/**
 * Worker thread handler
 */
export default async function (message: WorkerMessage): Promise<ScrapeResult> {
    try {
        // Connect to Dragonfly (lazy, per worker)
        await dragonfly.connect();

        // Load scraper using worker-local context (thread-safe)
        const scraper = await workerContext.loadScraper(message.packagePath, message.className);

        // Execute scrape
        const result = await scraper.scrape(message.options);
        return result;

    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
            success: false,
            error: err.message,
            metadata: {
                url: message.options.url || '',
                timestamp: new Date().toISOString(),
                executionTimeMs: 0,
                engine: 'worker-error'
            }
        };
    }
}
