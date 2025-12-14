import { parentPort } from 'worker_threads';
import { ScrapeOptions, logger, validateEnvironment, dragonfly } from '@nx-scraper/shared';

// Cache for loaded classes to avoid re-importing
const loadedScrapers = new Map<string, any>();

if (!parentPort) {
    throw new Error('This script must be run as a worker thread');
}

// CRITICAL: Initialize environment and DragonflyDB connection in worker context
// This ensures all services are ready before any scraper imports
(async () => {
    try {
        validateEnvironment();
        logger.info('🔧 Scraper Worker Thread: Environment validated');

        // Pre-connect to DragonflyDB to ensure it's ready for caching
        await dragonfly.connect();
        logger.info('🐉 Scraper Worker Thread: DragonflyDB connected and ready');

        logger.info('✅ Scraper Worker Thread fully initialized');
    } catch (error: any) {
        logger.fatal({ error }, 'Worker thread initialization failed');
        process.exit(1);
    }
})();

parentPort.on('message', async (message: {
    packagePath: string;
    className: string;
    options: ScrapeOptions
}) => {
    const { packagePath, className, options } = message;

    try {
        let ScraperClass = loadedScrapers.get(packagePath);

        if (!ScraperClass) {
            // Dynamic import of the scraper package
            // Using implicit 'import' which resolves node_modules relative to this file's location
            // or standard node resolution. 
            logger.debug(`Loading scraper: ${className} from ${packagePath}`);
            const module = await import(packagePath);
            ScraperClass = module[className];

            if (!ScraperClass) {
                throw new Error(`Class ${className} not found in ${packagePath}`);
            }
            loadedScrapers.set(packagePath, ScraperClass);
        }

        const scraper = new ScraperClass();

        // Execute scrape
        logger.debug(`Executing scrape job: ${options.url}`);
        const result = await scraper.scrape(options);

        // Cleanup if available
        if (typeof scraper.cleanup === 'function') {
            await scraper.cleanup();
        }

        parentPort?.postMessage({ success: true, result });

    } catch (error: any) {
        logger.error({ error, scraper: className }, 'Worker scrape failed');
        parentPort?.postMessage({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});
