import dotenv from 'dotenv';
import { JobWorker } from './orchestrator/worker.js';
import { pluginManager } from './plugins/plugin-manager.js';
import { browserPool, logger, validateEnvironment, env } from '@nx-scraper/shared';

// Load environment variables
dotenv.config();

// Validate environment before starting
try {
    logger.info('🔍 Starting environment validation...');
    validateEnvironment();
} catch (error: any) {
    logger.fatal({ error }, 'Environment validation failed');
    process.exit(1);
}

/**
 * Core Engine Entry Point
 * Plugin-based scraping orchestrator
 */
async function main() {
    logger.info('🚀 Starting NxScraper Core Engine...');
    logger.info(`Environment: ${env.NODE_ENV}`);

    try {
        // Load and register scraper plugins
        await registerScrapers();

        logger.info(`✅ Registered scrapers: ${pluginManager.getAll().length}`);
        pluginManager.getAll().forEach(scraper => {
            logger.info(`  📦 ${scraper.name} v${scraper.version}`);
        });

        logger.info('✅ All scrapers registered successfully');

        // Determine service logic based on SERVICE_TYPE env var
        const serviceType = env.SERVICE_TYPE; // 'api', 'worker', 'all' - defaulting handled in env validator

        logger.info(`🔧 Service Type: ${serviceType.toUpperCase()}`);

        // Start API server if needed
        if (serviceType === 'api' || serviceType === 'all') {
            const { startAPI } = await import('./api/server.js');
            startAPI();
            logger.info('✅ API Server module started');
        }

        // Start Worker if needed
        let worker: JobWorker | null = null;
        if (serviceType === 'worker' || serviceType === 'all') {
            worker = new JobWorker();
            logger.info(`✅ Worker module started (Queue: scrape-queue)`);
        }

        // Graceful shutdown
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received, shutting down gracefully...`);
            if (worker) await worker.shutdown();
            if (browserPool) await browserPool.shutdown();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        logger.info(`✅ Core Engine (${serviceType}) started successfully`);
        logger.info(`🔄 Waiting for jobs on queue: scrape-queue`);

    } catch (error: any) {
        logger.error(error, 'Failed to start core-engine:');
        process.exit(1);
    }
}

/**
 * Dynamically register scraper plugins
 * Scrapers are now optional peer dependencies and loaded dynamically
 */
async function registerScrapers() {
    const availableScrapers = [
        { name: 'UniversalScraper', package: '@nx-scraper/universal-scraper/scraper' },
        { name: 'HeavyScraper', package: '@nx-scraper/heavy-scraper/scraper' },
        { name: 'GoogleScraper', package: '@nx-scraper/google-scraper/scraper' },
    ];

    let registeredCount = 0;

    for (const { name, package: pkg } of availableScrapers) {
        try {
            const module = await import(pkg);
            const ScraperClass = module[name];

            if (!ScraperClass) {
                logger.warn(`⚠️  Scraper class ${name} not found in ${pkg} - skipping`);
                continue;
            }

            pluginManager.register(new ScraperClass(), pkg, name);
            logger.info(`✅ Registered: ${name}`);
            registeredCount++;

        } catch (error: any) {
            if (error.code === 'ERR_MODULE_NOT_FOUND') {
                logger.warn(`⚠️  Scraper not installed: ${name} (${pkg}) - skipping`);
                logger.info(`   To use this scraper, install it: npm install ${pkg.split('/scraper')[0]}`);
            } else {
                logger.error(`❌ Failed to load ${name}: ${error.message}`);
                throw error;
            }
        }
    }

    if (registeredCount === 0) {
        logger.fatal('No scrapers registered. Install at least one scraper package.');
        logger.info('Available scrapers:');
        availableScrapers.forEach(({ name, package: pkg }) => {
            logger.info(`  - npm install ${pkg.split('/scraper')[0]}`);
        });
        throw new Error('No scrapers available. Please install at least one scraper package.');
    }

    logger.info(`✅ Successfully registered ${registeredCount}/${availableScrapers.length} scrapers`);
}

main().catch((error) => {
    logger.error('💥 Fatal error:', error);
    process.exit(1);
});
