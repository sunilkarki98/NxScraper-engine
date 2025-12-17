// AI
export * from './ai/index.js';
export { createAIEngine } from './ai/ai-engine.js';

// AI RAG (missing exports)
export { VectorDocument } from './ai/rag/vector-store.js';

// AI Agent Modules (missing exports)
export { AgentModule, AgentAction } from './ai/modules/agent.js';
export { Planner } from './ai/modules/planner.js';
export { Memory } from './ai/modules/memory.js';

// AI Types (missing exports)
export { PlanStep, ExecutionPlan, ExecutionStage, AgentContext, StepResult } from './ai/types.js';

// Auth
export * from './auth/api-key-manager.js';
export * from './auth/external-key-manager.js';
export * from './auth/login-handler.js';
export * from './auth/session-manager.js';
export * from './auth/session-pool.js';
export * from './auth/session-renewal.js';

// Browser & Interaction
export * from './browser/fingerprint-generator.js';
// Duplicate removed
export * from './browser/evasion/ghost-cursor.js';
export * from './browser/interaction-manager.js';
export * from './browser/pool.js';

// Database
export * from './database/dragonfly-client.js';

// Queue
export * from './queue/queue-manager.js';
// export * from './queue/queue-worker.js';

// Services
export * from './services/browser-pool-scaler.js';
export * from './services/cache.service.js';
export * from './services/proxy-manager.js';
// export * from './ai/rag/embedding-service.js'; // Exported below with factory
// export * from './ai/rag/vector-store.js';      // Exported below with factory
// export * from './ai/llm-provider.js';
export * from './ai/rag/knowledge-base.js';
export * from './ai/modules/page-understanding.js';
export * from './ai/modules/selection.js'; // Export new module
export * from './services/proxy.service.js';
export * from './services/rate-limiter.js';
export * from './services/request-batcher.js';
export * from './services/event-bus.js';
export * from './services/router-stats.service.js';
export * from './services/circuit-breaker.service.js';
export * from './services/evasion.service.js';
export * from './services/grid.service.js';
export * from './services/scraper-intelligence.js';
export * from './observability/system-monitor.js';
export * from './observability/metrics.js';
export * from './observability/error-classifier.js';
export * from './observability/tracing-context.js';

// Types
export * from './types/api-key.interface.js';
export * from './types/api-response.js';
export * from './types/api-schemas.js';
export * from './types/auth-errors.js';
export * from './types/browser.interface.js';
export * from './types/business.interface.js';
export * from './types/errors.js';
export * from './types/evasion.interface.js';
export * from './types/job-types.js';
export * from './types/job-types.js';
export * from './types/scraper.interface.js';
export * from './scrapers/base-playwright-scraper.js';
export * from './types/session.interface.js';
export * from './types/metrics.interface.js';
export * from './types/webhook.interface.js';
export * from './types/express-types.js';


// Utils
// Explicitly export symbols to avoid conflicts (specifically ICaptchaSolver)
export {
    CaptchaChallenge,
    CaptchaSolution,
    MockCaptchaSolver,
    captchaSolver,
    ICaptchaSolver as ICaptchaSolverUtil // Alias to avoid conflict if needed, or just exclude it if the one in types is preferred
} from './utils/captcha-solver.js';

export * from './utils/circuit-breaker.js';
export * from './utils/env-validator.js';
export * from './utils/html-parser.js';
export { default as logger, contextStorage } from './utils/logger.js';

// === DI Container ===
export { container, Tokens, ServiceContainer, createToken } from './di/container.js';
export type { ServiceToken, Lifecycle, Factory } from './di/container.js';

// === Factory Functions (Phase 1 conversions) ===
export { createBrowserPool, browserPool } from './browser/pool.js';
export { createDragonflyClient, dragonfly } from './database/dragonfly-client.js';
export { createQueueManager, queueManager } from './queue/queue-manager.js';
export { createEvasionService, evasionService } from './services/evasion.service.js';
export { createCircuitBreakerService, circuitBreakerService } from './services/circuit-breaker.service.js';
export { createGridService, gridService } from './services/grid.service.js';
export { createRateLimiter, rateLimiter } from './services/rate-limiter.js';

// === Factory Functions (Phase 2A conversions) ===
export { createApiKeyManager, apiKeyManager } from './auth/api-key-manager.js';
export { createSessionManager, sessionManager } from './auth/session-manager.js';
export { createProxyManager, proxyManager } from './services/proxy-manager.js';
export { createEmbeddingService, embeddingService } from './ai/rag/embedding-service.js';
// Duplicate removed
export { createVectorStore, vectorStore } from './ai/rag/vector-store.js';
export { createEventBus } from './services/event-bus.js';
export { RouterStatsService } from './services/router-stats.service.js';


// Worker
// export * from './worker/scraper-manager.js';
