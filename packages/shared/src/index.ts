// AI
export * from './ai/index.js';

// AI RAG (missing exports)
export { embeddingService } from './ai/rag/embedding-service.js';
export { vectorStore, VectorDocument } from './ai/rag/vector-store.js';

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

// Browser
export * from './browser/fingerprint-generator.js';
export * from './browser/evasion/ghost-cursor.js';
export * from './browser/pool.js';

// Database
export * from './database/dragonfly-client.js';

// Queue
export * from './queue/queue-manager.js';
export * from './queue/queue-worker.js';

// Services
export * from './services/browser-pool-scaler.js';
export * from './services/cache.service.js';
export * from './services/proxy-manager.js';
export * from './services/proxy.service.js';
export * from './services/rate-limiter.js';
export * from './services/request-batcher.js';

// Types
export * from './types/api-key.interface.js';
export * from './types/api-response.js';
export * from './types/api-schemas.js';
export * from './types/auth-errors.js';
export * from './types/browser.interface.js';
export * from './types/business.interface.js';
export * from './types/errors.js';
export * from './types/evasion.interface.js';
export * from './types/scraper.interface.js';
export * from './types/session.interface.js';
export * from './types/metrics.interface.js';
export * from './types/webhook.interface.js';

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

// Worker
export * from './worker/scraper-manager.js';
