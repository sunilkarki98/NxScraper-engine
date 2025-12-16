import {
    container,
    Tokens,
    createBrowserPool,
    createDragonflyClient,
    createQueueManager,
    createCacheService,
    createRateLimiter,
    createApiKeyManager,
    createSessionManager,
    createProxyManager,
    createEmbeddingService,
    createVectorStore,
    createVectorStore,
    createAIEngine,
    createEventBus,
    RouterStatsService,
    logger
} from '@nx-scraper/shared';
import { queueWorker } from '../worker/queue-worker.js';
import { scraperManager } from '../worker/scraper-manager.js';

export async function bootstrapDI(): Promise<void> {
    logger.info('🔧 Registering services in DI container...');

    // Infrastructure services (Phase 1)
    // Browser (Singleton Pool)
    container.registerFactory(Tokens.BrowserPool, () => createBrowserPool(), 'singleton');
    container.registerFactory(Tokens.Dragonfly, () => createDragonflyClient(), 'singleton');
    container.registerFactory(Tokens.QueueManager, () => createQueueManager(), 'singleton');
    container.registerFactory(Tokens.CacheService, () => createCacheService(), 'singleton');
    container.registerFactory(Tokens.RateLimiter, () => createRateLimiter(), 'singleton');
    container.registerFactory(Tokens.RouterStats, () => new RouterStatsService(), 'singleton');

    // Auth & Network services (Phase 2A)
    container.registerFactory(Tokens.ApiKeyManager, () => createApiKeyManager(), 'singleton');
    container.registerFactory(Tokens.SessionManager, () => createSessionManager(), 'singleton');
    container.registerFactory(Tokens.ProxyManager, () => createProxyManager(), 'singleton');

    // AI Services (Phase 2A)
    container.registerFactory(Tokens.AIEngine, () => createAIEngine(), 'singleton');
    container.registerFactory(Tokens.EmbeddingService, () => createEmbeddingService(), 'singleton');
    container.registerFactory(Tokens.VectorStore, () => createVectorStore(), 'singleton');
    container.registerFactory(Tokens.EventBus, () => createEventBus(), 'singleton');

    // Legacy services (Phase 2B/3)
    container.register(Tokens.QueueWorker, queueWorker);
    container.register(Tokens.ScraperManager, scraperManager);

    logger.debug(`Registered services: ${container.getRegisteredServices().join(', ')}`);
}
