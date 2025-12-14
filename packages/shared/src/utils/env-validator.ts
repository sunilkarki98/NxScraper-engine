import { z } from 'zod';
import logger from './logger.js';

/**
 * Comprehensive Environment Validation Schema
 * Validates ALL environment variables at application startup
 * Fails fast if critical configuration is missing or invalid
 */

// Helper validators
const portValidator = z.coerce.number().int().min(1).max(65535);
const urlValidator = z.string().url();
const positiveInt = z.coerce.number().int().positive();
const hexString64 = z.string().length(64).regex(/^[0-9a-f]{64}$/i, {
    message: 'Must be 64 hexadecimal characters. Generate with: openssl rand -hex 32'
});

/**
 * Main Environment Schema
 * REQUIRED fields will cause startup failure if missing
 * OPTIONAL fields have sensible defaults
 */
const EnvironmentSchema = z.object({
    // ==========================================
    // Core Application
    // ==========================================
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: portValidator.default(3000),
    HOST: z.string().default('localhost'),

    // ==========================================
    // Critical Security (REQUIRED)
    // ==========================================
    SESSION_ENCRYPTION_KEY: hexString64.describe(
        'Required for session encryption. Generate with: openssl rand -hex 32'
    ),

    ADMIN_SECRET: z.string().min(20).describe(
        'Required for admin operations. Generate with: openssl rand -base64 32'
    ),

    // ==========================================
    // Database & Cache (REQUIRED)
    // ==========================================
    DRAGONFLY_URL: urlValidator.describe('Redis/Dragonfly connection URL (e.g., redis://localhost:6379)'),

    // ==========================================
    // AI Providers (At least ONE required for AI features)
    // ==========================================
    OPENAI_API_KEY: z.string().min(20).optional().or(z.literal('')),
    ANTHROPIC_API_KEY: z.string().min(20).optional().or(z.literal('')),
    GOOGLE_API_KEY: z.string().min(20).optional().or(z.literal('')),
    DEEPSEEK_API_KEY: z.string().min(20).optional().or(z.literal('')),
    OPENROUTER_API_KEY: z.string().min(20).optional().or(z.literal('')),
    GEMINI_API_KEY: z.string().min(20).optional().or(z.literal('')), // Alias for GOOGLE_API_KEY

    // ==========================================
    // Ollama (Local LLM)
    // ==========================================
    OLLAMA_BASE_URL: z.string().url().optional().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().optional().default('llama3'),

    // ==========================================
    // Vector Database
    // ==========================================
    CHROMA_DB_URL: z.string().url().optional().default('http://localhost:8000'),

    // ==========================================
    // Queue Configuration
    // ==========================================
    WORKER_CONCURRENCY: positiveInt.optional().default(5),
    QUEUE_CONCURRENCY: positiveInt.optional().default(5),
    QUEUE_MAX_JOBS: positiveInt.optional().default(1000),
    QUEUE_REMOVE_ON_COMPLETE: positiveInt.optional().default(100),
    QUEUE_REMOVE_ON_FAIL: positiveInt.optional().default(1000),
    JOB_TIMEOUT_MS: positiveInt.optional().default(120000),
    JOB_ATTEMPTS: positiveInt.optional().default(3),

    // ==========================================
    // Logging & Monitoring
    // ==========================================
    LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).optional().default('info'),
    LOG_PRETTY: z.coerce.boolean().optional().default(true),
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
    SENTRY_ENVIRONMENT: z.string().optional(),

    // ==========================================
    // Rate Limiting
    // ==========================================
    RATE_LIMIT_WINDOW_MS: positiveInt.optional().default(60000),
    RATE_LIMIT_MAX_REQUESTS: positiveInt.optional().default(100),

    // ==========================================
    // CORS
    // ==========================================
    CORS_ORIGIN: z.string().optional().default('http://localhost:3001'),
    CORS_CREDENTIALS: z.coerce.boolean().optional().default(true),

    // ==========================================
    // Feature Flags
    // ==========================================
    ENABLE_AI_SCRAPING: z.coerce.boolean().optional().default(true),
    ENABLE_SCREENSHOT: z.coerce.boolean().optional().default(true),
    ENABLE_PDF_GENERATION: z.coerce.boolean().optional().default(false),
    ENABLE_WEBHOOK_NOTIFICATIONS: z.coerce.boolean().optional().default(false),

    // ==========================================
    // AI Model Configuration
    // ==========================================
    AGENT_MODEL: z.string().optional().default('gpt-4o'),
    VISION_MODEL: z.string().optional().default('gpt-4o'),

    // ==========================================
    // Proxy Configuration
    // ==========================================
    PROXY_ENABLED: z.coerce.boolean().optional().default(false),
    PROXY_LIST: z.string().optional(),
    PROXY_ROTATION_STRATEGY: z.enum(['random', 'round-robin', 'least-used']).optional().default('random'),

    // ==========================================
    // Service Configuration
    // ==========================================
    SERVICE_TYPE: z.enum(['api', 'worker', 'all']).optional().default('all'),
    API_PORT: portValidator.optional().default(3000),

    // ==========================================
    // Captcha (Optional)
    // ==========================================
    CAPTCHA_API_KEY: z.string().optional(),

    // ==========================================
    // OpenRouter Specific
    // ==========================================
    OPENROUTER_APP_NAME: z.string().optional().default('nxscraper-engine'),

    // ==========================================
    // Circuit Breaker
    // ==========================================
    AI_CIRCUIT_FAILURE_THRESHOLD: positiveInt.optional().default(5),
    AI_CIRCUIT_COOLDOWN_MS: positiveInt.optional().default(60000),
    SCRAPER_CIRCUIT_FAILURE_THRESHOLD: positiveInt.optional().default(3),
    SCRAPER_CIRCUIT_COOLDOWN_MS: positiveInt.optional().default(30000),

    // ==========================================
    // Webhooks
    // ==========================================
    WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
    WEBHOOK_SECRET: z.string().optional().or(z.literal('')),

    // ==========================================
    // Caching
    // ==========================================
    CACHE_ENABLED: z.coerce.boolean().optional().default(true),
    CACHE_TTL_SECONDS: positiveInt.optional().default(3600),
    CACHE_MAX_SIZE_MB: positiveInt.optional().default(100),

    // ==========================================
    // Metrics
    // ==========================================
    METRICS_ENABLED: z.coerce.boolean().optional().default(true),
    METRICS_PORT: portValidator.optional().default(9090),

    // ==========================================
    // Development & Testing
    // ==========================================
    DEV_SKIP_AUTH: z.coerce.boolean().optional().default(false),
    MOCK_AI_RESPONSES: z.coerce.boolean().optional().default(false),

    // ==========================================
    // Production Optimizations
    // ==========================================
    COMPRESSION_ENABLED: z.coerce.boolean().optional().default(true),
    COMPRESSION_THRESHOLD: positiveInt.optional().default(1024),
    TRUST_PROXY: z.coerce.boolean().optional().default(false),
    CLUSTER_MODE: z.coerce.boolean().optional().default(false),
    CLUSTER_WORKERS: positiveInt.optional().default(4),
});

// Infer TypeScript type from schema
export type Environment = z.infer<typeof EnvironmentSchema>;

// Validated environment singleton
let validatedEnv: Environment | null = null;

/**
 * Validate environment variables on startup
 * Throws detailed error if validation fails
 */
export function validateEnvironment(): Environment {
    try {
        // Parse and validate
        validatedEnv = EnvironmentSchema.parse(process.env);

        // Additional business logic validation
        validateBusinessRules(validatedEnv);

        logger.info('✅ Environment validation passed');
        logger.info(`📦 Running in ${validatedEnv.NODE_ENV} mode`);
        logger.info(`🚀 Service type: ${validatedEnv.SERVICE_TYPE}`);

        return validatedEnv;
    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ ENVIRONMENT VALIDATION FAILED\n');
            console.error('Configuration errors found:\n');

            // Format errors in a user-friendly way
            error.issues.forEach((err, index: number) => {
                const path = err.path.join('.');
                console.error(`${index + 1}. ${path}: ${err.message}`);
            });

            console.error('\n📝 Please check your .env file or environment variables.');
            console.error('📖 See .env.example for required variables.\n');
        } else {
            console.error('❌ ENVIRONMENT VALIDATION FAILED:', error);
        }

        process.exit(1);
    }
}

/**
 * Additional business logic validation
 */
function validateBusinessRules(env: Environment): void {
    // Rule 1: At least one AI provider key must be present for AI features
    if (env.ENABLE_AI_SCRAPING) {
        const hasAIKey =
            env.OPENAI_API_KEY ||
            env.ANTHROPIC_API_KEY ||
            env.GOOGLE_API_KEY ||
            env.GEMINI_API_KEY ||
            env.DEEPSEEK_API_KEY ||
            env.OPENROUTER_API_KEY;

        if (!hasAIKey) {
            logger.warn(
                '⚠️  AI scraping is enabled but no LLM API keys found. ' +
                'AI features will not work. Set at least one of: ' +
                'OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY'
            );
        }
    }

    // Rule 2: Warn about insecure configurations in production
    if (env.NODE_ENV === 'production') {
        if (env.DEV_SKIP_AUTH) {
            logger.error('🚨 SECURITY WARNING: DEV_SKIP_AUTH is enabled in production!');
            throw new Error('Cannot skip authentication in production mode');
        }

        if (env.LOG_LEVEL === 'debug' || env.LOG_LEVEL === 'trace') {
            logger.warn('⚠️  Verbose logging enabled in production. This may impact performance.');
        }

        if (!env.SENTRY_DSN) {
            logger.warn('⚠️  No Sentry DSN configured. Error tracking disabled in production.');
        }
    }

    // Rule 3: Reject weak/default secrets
    const weakSecrets = [
        'your-super-secret-jwt-key-change-this',
        'nxscrape-admin122498',
        'change-this',
        'password',
        'secret',
        '12345',
        'admin'
    ];

    const adminSecret = env.ADMIN_SECRET || '';
    if (weakSecrets.some(weak => adminSecret.toLowerCase().includes(weak.toLowerCase()))) {
        logger.error('🚨 SECURITY CRITICAL: Weak ADMIN_SECRET detected!');
        if (env.NODE_ENV === 'production') {
            throw new Error(
                'ADMIN_SECRET contains a weak/default value. Generate a strong secret with: openssl rand -base64 32'
            );
        } else {
            logger.warn('⚠️  Using weak ADMIN_SECRET in development. This is ONLY acceptable for testing!');
        }
    }

    if (adminSecret.length < 20) {
        logger.error('🚨 SECURITY CRITICAL: ADMIN_SECRET is too short (minimum 20 characters)');
        if (env.NODE_ENV === 'production') {
            throw new Error('ADMIN_SECRET must be at least 20 characters long');
        }
    }

    // Rule 4: Validate proxy configuration
    if (env.PROXY_ENABLED && !env.PROXY_LIST) {
        logger.warn('⚠️  Proxy is enabled but PROXY_LIST is not set. Proxy will not work.');
    }
}

/**
 * Get validated environment (must call validateEnvironment() first)
 */
export function getEnv(): Environment {
    if (!validatedEnv) {
        throw new Error(
            'Environment not validated yet. Call validateEnvironment() at application startup.'
        );
    }
    return validatedEnv;
}

/**
 * Type-safe environment variable accessor
 * Prevents direct process.env access throughout the application
 */
export const env = new Proxy({} as Environment, {
    get(target, prop: string) {
        if (!validatedEnv) {
            throw new Error(
                'Environment not validated yet. Call validateEnvironment() at application startup.'
            );
        }
        return validatedEnv[prop as keyof Environment];
    }
});
