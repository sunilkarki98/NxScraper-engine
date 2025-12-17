import {
    container,
    Tokens,
    createBrowserPool,
    createDragonflyClient,
    createCacheService,
    createRateLimiter,
    createApiKeyManager,
    createSessionManager,
    createProxyManager,
    createEmbeddingService,
    createVectorStore,
    createAIEngine,
    createEventBus,
    RouterStatsService,
    logger
} from '@nx-scraper/shared';

/**
 * Lightweight DI bootstrap for worker threads
 * Does NOT register QueueWorker or ScraperManager (main thread only)
 */
export async function bootstrapWorkerDI(): Promise<void> {
    logger.debug('🔧 Registering worker-safe services...');

    // Infrastructure services
    container.registerFactory(Tokens.BrowserPool, () => createBrowserPool(), 'singleton');
    container.registerFactory(Tokens.Dragonfly, () => createDragonflyClient(), 'singleton');
    container.registerFactory(Tokens.CacheService, () => createCacheService(), 'singleton');
    container.registerFactory(Tokens.RateLimiter, () => createRateLimiter(), 'singleton');
    container.registerFactory(Tokens.RouterStats, () => new RouterStatsService(), 'singleton');

    // Auth & Network services
    container.registerFactory(Tokens.ApiKeyManager, () => createApiKeyManager(), 'singleton');
    container.registerFactory(Tokens.SessionManager, () => createSessionManager(), 'singleton');
    container.registerFactory(Tokens.ProxyManager, () => createProxyManager(), 'singleton');

    // AI Services
    container.registerFactory(Tokens.AIEngine, () => createAIEngine(), 'singleton');
    container.registerFactory(Tokens.EmbeddingService, () => createEmbeddingService(), 'singleton');
    container.registerFactory(Tokens.VectorStore, () => createVectorStore(), 'singleton');
    container.registerFactory(Tokens.EventBus, () => createEventBus(), 'singleton');

    logger.debug('✅ Worker services registered');
}
