import { z } from 'zod';
/**
 * Main Environment Schema
 * REQUIRED fields will cause startup failure if missing
 * OPTIONAL fields have sensible defaults
 */
declare const EnvironmentSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        production: "production";
        test: "test";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    HOST: z.ZodDefault<z.ZodString>;
    SESSION_ENCRYPTION_KEY: z.ZodString;
    DRAGONFLY_URL: z.ZodString;
    OPENAI_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    ANTHROPIC_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    GOOGLE_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    DEEPSEEK_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    OPENROUTER_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    GEMINI_API_KEY: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    OLLAMA_BASE_URL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    OLLAMA_MODEL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    CHROMA_DB_URL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    WORKER_CONCURRENCY: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    QUEUE_CONCURRENCY: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    QUEUE_MAX_JOBS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    QUEUE_REMOVE_ON_COMPLETE: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    QUEUE_REMOVE_ON_FAIL: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    JOB_TIMEOUT_MS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    JOB_ATTEMPTS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    LOG_LEVEL: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        info: "info";
        error: "error";
        warn: "warn";
        debug: "debug";
        trace: "trace";
    }>>>;
    LOG_PRETTY: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    SENTRY_DSN: z.ZodOptional<z.ZodString>;
    SENTRY_ENVIRONMENT: z.ZodOptional<z.ZodString>;
    RATE_LIMIT_WINDOW_MS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    RATE_LIMIT_MAX_REQUESTS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    CORS_ORIGIN: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    CORS_CREDENTIALS: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    ENABLE_AI_SCRAPING: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    ENABLE_SCREENSHOT: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    ENABLE_PDF_GENERATION: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    ENABLE_WEBHOOK_NOTIFICATIONS: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    AGENT_MODEL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    VISION_MODEL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    PROXY_ENABLED: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    PROXY_LIST: z.ZodOptional<z.ZodString>;
    PROXY_ROTATION_STRATEGY: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        random: "random";
        "round-robin": "round-robin";
        "least-used": "least-used";
    }>>>;
    SERVICE_TYPE: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        api: "api";
        worker: "worker";
        all: "all";
    }>>>;
    API_PORT: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    CAPTCHA_API_KEY: z.ZodOptional<z.ZodString>;
    OPENROUTER_APP_NAME: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    AI_CIRCUIT_FAILURE_THRESHOLD: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    AI_CIRCUIT_COOLDOWN_MS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    SCRAPER_CIRCUIT_FAILURE_THRESHOLD: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    SCRAPER_CIRCUIT_COOLDOWN_MS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    CACHE_ENABLED: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    CACHE_TTL_SECONDS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    CACHE_MAX_SIZE_MB: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    METRICS_ENABLED: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    METRICS_PORT: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    DEV_SKIP_AUTH: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    MOCK_AI_RESPONSES: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    COMPRESSION_ENABLED: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    COMPRESSION_THRESHOLD: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    TRUST_PROXY: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    CLUSTER_MODE: z.ZodDefault<z.ZodOptional<z.ZodCoercedBoolean<unknown>>>;
    CLUSTER_WORKERS: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
export type Environment = z.infer<typeof EnvironmentSchema>;
/**
 * Validate environment variables on startup
 * Throws detailed error if validation fails
 */
export declare function validateEnvironment(): Environment;
/**
 * Get validated environment (must call validateEnvironment() first)
 */
export declare function getEnv(): Environment;
/**
 * Type-safe environment variable accessor
 * Prevents direct process.env access throughout the application
 */
export declare const env: {
    NODE_ENV: z.core.$InferEnumOutput<{
        development: "development";
        production: "production";
        test: "test";
    }>;
    PORT: number;
    HOST: string;
    SESSION_ENCRYPTION_KEY: string;
    DRAGONFLY_URL: string;
    OLLAMA_BASE_URL: string;
    OLLAMA_MODEL: string;
    CHROMA_DB_URL: string;
    WORKER_CONCURRENCY: number;
    QUEUE_CONCURRENCY: number;
    QUEUE_MAX_JOBS: number;
    QUEUE_REMOVE_ON_COMPLETE: number;
    QUEUE_REMOVE_ON_FAIL: number;
    JOB_TIMEOUT_MS: number;
    JOB_ATTEMPTS: number;
    LOG_LEVEL: z.core.$InferEnumOutput<{
        info: "info";
        error: "error";
        warn: "warn";
        debug: "debug";
        trace: "trace";
    }>;
    LOG_PRETTY: boolean;
    RATE_LIMIT_WINDOW_MS: number;
    RATE_LIMIT_MAX_REQUESTS: number;
    CORS_ORIGIN: string;
    CORS_CREDENTIALS: boolean;
    ENABLE_AI_SCRAPING: boolean;
    ENABLE_SCREENSHOT: boolean;
    ENABLE_PDF_GENERATION: boolean;
    ENABLE_WEBHOOK_NOTIFICATIONS: boolean;
    AGENT_MODEL: string;
    VISION_MODEL: string;
    PROXY_ENABLED: boolean;
    PROXY_ROTATION_STRATEGY: z.core.$InferEnumOutput<{
        random: "random";
        "round-robin": "round-robin";
        "least-used": "least-used";
    }>;
    SERVICE_TYPE: z.core.$InferEnumOutput<{
        api: "api";
        worker: "worker";
        all: "all";
    }>;
    API_PORT: number;
    OPENROUTER_APP_NAME: string;
    AI_CIRCUIT_FAILURE_THRESHOLD: number;
    AI_CIRCUIT_COOLDOWN_MS: number;
    SCRAPER_CIRCUIT_FAILURE_THRESHOLD: number;
    SCRAPER_CIRCUIT_COOLDOWN_MS: number;
    CACHE_ENABLED: boolean;
    CACHE_TTL_SECONDS: number;
    CACHE_MAX_SIZE_MB: number;
    METRICS_ENABLED: boolean;
    METRICS_PORT: number;
    DEV_SKIP_AUTH: boolean;
    MOCK_AI_RESPONSES: boolean;
    COMPRESSION_ENABLED: boolean;
    COMPRESSION_THRESHOLD: number;
    TRUST_PROXY: boolean;
    CLUSTER_MODE: boolean;
    CLUSTER_WORKERS: number;
    OPENAI_API_KEY?: string | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    GOOGLE_API_KEY?: string | undefined;
    DEEPSEEK_API_KEY?: string | undefined;
    OPENROUTER_API_KEY?: string | undefined;
    GEMINI_API_KEY?: string | undefined;
    SENTRY_DSN?: string | undefined;
    SENTRY_ENVIRONMENT?: string | undefined;
    PROXY_LIST?: string | undefined;
    CAPTCHA_API_KEY?: string | undefined;
};
export {};
//# sourceMappingURL=env-validator.d.ts.map