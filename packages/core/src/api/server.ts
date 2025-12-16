import express, { Request, Response } from 'express';
import { pluginManager } from '../plugins/plugin-manager.js';
import { browserPool } from '@nx-scraper/shared';
import { proxyService } from '@nx-scraper/shared';
import { logger, env, apiKeyManager, container, Tokens } from '@nx-scraper/shared';
import aiRoutes from './routes/ai.routes.js';
import { globalErrorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { requestTracingMiddleware } from './middleware/tracing.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import compression from 'compression';
import { initSentry, Sentry } from '../observability/sentry.js';
import { securityHeaders, corsMiddleware, createUserRateLimit, sanitizeRequest } from './middleware/security.middleware.js';
import { initMetrics, getMetrics, httpRequestsTotal, httpRequestDuration } from '../observability/metrics.js';
import { gracefulShutdown, readyCheck } from '../shutdown/graceful-shutdown.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './docs/swagger.js';

const app = express();
const PORT = env.API_PORT;

// Trust Proxy Configuration (Critical for Rate Limiting behind LB)
if (env.TRUST_PROXY) {
    logger.info('🛡️  Trust Proxy enabled (behind Load Balancer)');
    app.set('trust proxy', true); // Trust the immediate upstream proxy
}

// Initialize Sentry (do this first)
if (env.SENTRY_DSN) {
    initSentry({
        dsn: env.SENTRY_DSN,
        environment: env.NODE_ENV,
        tracesSampleRate: 0.1,
    });
}

// Initialize metrics
initMetrics();

// Security middleware (must be early)
app.use(securityHeaders);
app.use(corsMiddleware);

// Request parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request tracking
app.use(requestIdMiddleware);
app.use(compression({
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
app.use(requestTracingMiddleware);

// Request sanitization  
app.use(sanitizeRequest);

// Metrics tracking middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        httpRequestsTotal.inc({
            method: req.method,
            route: req.route?.path || req.path,
            status_code: res.statusCode.toString(),
        });
        httpRequestDuration.observe(
            {
                method: req.method,
                route: req.route?.path || req.path,
                status_code: res.statusCode.toString(),
            },
            duration
        );
    });
    next();
});

// Ready check (503 during shutdown)
app.use(readyCheck);

// Global rate limit (as fallback)
// Per-user tiered rate limiting
app.use(createUserRateLimit());

// Public endpoints (no authentication required)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


/**
 * Health Check Endpoint
 */
app.get('/health', async (req: Request, res: Response) => {
    try {
        const scraperHealth = await pluginManager.healthCheck();
        const allHealthy = Object.values(scraperHealth).every(v => v === true);

        res.status(allHealthy ? 200 : 503).json({
            status: allHealthy ? 'healthy' : 'degraded',
            timestamp: new Date().toISOString(),
            scrapers: scraperHealth,
            browserPool: browserPool.getStats(),
            proxy: proxyService.getStats(),
            cache: cacheService.getStats()
        });
    } catch (error: any) {
        logger.error(error, 'Health check failed:');
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * Readiness Check (for K8s)
 */
app.get('/ready', (req: Request, res: Response) => {
    const scrapers = pluginManager.getAll();
    if (scrapers.length === 0) {
        return res.status(503).json({
            ready: false,
            reason: 'No scrapers registered'
        });
    }

    res.json({
        ready: true,
        scrapers: scrapers.length
    });
});

/**
 * Metrics Endpoint (Prometheus-compatible)
 */
app.get('/metrics', async (req: Request, res: Response) => {
    try {
        const metrics = await getMetrics();
        res.set('Content-Type', 'text/plain');
        res.send(metrics);
    } catch (error) {
        logger.error({ error }, 'Failed to get metrics');
        res.status(500).send('Error generating metrics');
    }
});

/**
 * Stats Endpoint (JSON)
 */
app.get('/stats', (req: Request, res: Response) => {
    const scrapers = pluginManager.getAll();

    res.json({
        scrapers: scrapers.map(s => ({
            name: s.name,
            version: s.version
        })),
        browserPool: browserPool.getStats(),
        proxy: proxyService.getStats(),
        cache: cacheService.getStats()
    });
});

/**
 * Sessions Endpoint
 */
app.get('/sessions/:domain', async (req: Request, res: Response) => {
    try {
        // Dynamic import to avoid circular dependency issues during startup if any
        const { sessionManager } = await import('../../../shared/src/auth/session-manager.js');
        const sessions = await sessionManager.getSessionsByDomain(req.params.domain);

        res.json({
            domain: req.params.domain,
            count: sessions.length,
            sessions: sessions.map((s: any) => ({
                id: s.id,
                isValid: s.isValid,
                expiresAt: new Date(s.expiresAt).toISOString(),
                lastUsed: new Date(s.lastUsedAt).toISOString()
            }))
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

import scrapeRoutes from './routes/scrape.routes.js';
import agentRoutes from './routes/agent.routes.js';
import businessRoutes from './routes/business.routes.js';
import keyRoutes from './routes/key.routes.js';
import proxyRoutes from './routes/proxy.routes.js';
import ragRoutes from './routes/rag.routes.js';
import jobRoutes from './routes/job.routes.js';
import { queueWorker } from '../worker/queue-worker.js';
import { cacheService } from '@nx-scraper/shared';

// Protected endpoints (require API key authentication)
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/scrape', scrapeRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/business', businessRoutes);
app.use('/api/v1/keys', keyRoutes);
app.use('/api/v1/proxies', proxyRoutes);
app.use('/api/v1/rag', ragRoutes);
app.use('/api/v1/jobs', jobRoutes);

// Ensure worker is loaded and metrics are wired
import { metricsAdapter } from '../observability/metrics.adapter.js';
import { webhookManager } from '../webhooks/webhook-manager.js';

queueWorker.setMetricsRecorder(metricsAdapter);
queueWorker.setWebhookDispatcher(webhookManager);
logger.info('👷 Queue Worker initialized with metrics and webhooks');

// 404 handler (after all routes)
app.use(notFoundHandler);

// Sentry error handler (before global error handler)
// This must be added after all routes and before any other error handling middleware
if (env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
}

// Global error handler (must be last)
app.use(globalErrorHandler);

/**
 * Start API Server
 */
export function startAPI() {
    const server = app.listen(PORT, async () => {
        logger.info(`🌐 API server listening on port ${PORT}`);
        logger.info(`   Health: http://localhost:${PORT}/health`);
        logger.info(`   Metrics: http://localhost:${PORT}/metrics`);
        logger.info(`   Stats: http://localhost:${PORT}/stats`);
        logger.info(`   🔒 Protected: /api/v1/ai/* (requires API key)`);
        logger.info(`   🛡️  Security: Helmet + CORS enabled`);
        if (env.SENTRY_DSN) {
            logger.info(`   📊 Monitoring: Sentry enabled`);
        }

        // Securely register Admin Key on startup
        if (env.ADMIN_SECRET) {
            try {
                // DI Pattern: Resolve service
                const apiKeyManager = container.resolve<any>(Tokens.ApiKeyManager);
                await apiKeyManager.ensureAdminKey(env.ADMIN_SECRET);
            } catch (err) {
                logger.error({ err }, '❌ Failed to register Admin Key on startup');
            }
        }
    });

    // Register server for graceful shutdown
    gracefulShutdown.setServer(server);

    // Register shutdown hooks
    gracefulShutdown.registerHooks({
        beforeShutdown: async () => {
            logger.info('Preparing for shutdown...');
        },
        onShutdown: async () => {
            logger.info('Closing connections...');
            // Close browser pool
            await browserPool.shutdown();
            // Cache is distributed (DragonflyDB) so we don't clear it on shutdown
            // await cacheService.clear();
        },
        afterShutdown: async () => {
            logger.info('Cleanup complete');
        },
    });

    // Initialize graceful shutdown
    gracefulShutdown.init();

    return server;
}
