import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const contextStorage = new AsyncLocalStorage<Map<string, any>>();

const logger = pino({
    name: 'nx-scraper',
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
        : undefined,
    redact: {
        paths: [
            'authorization',
            'cookie',
            'headers.authorization',
            'headers.cookie',
            'password',
            'apiKey',
            'api_key',
            'key',
            'secret',
            'token',
            'bearer',
            'auth',
            'privateKey',
            'private_key',
            'passphrase',
            'SESSION_ENCRYPTION_KEY',
            'JWT_SECRET',
            'ADMIN_SECRET',
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GOOGLE_API_KEY',
            'GEMINI_API_KEY',
            'DEEPSEEK_API_KEY',
            'OPENROUTER_API_KEY',
            'CAPTCHA_API_KEY',
            'BROWSERLESS_API_KEY',
            'context.apiKey.keyHash',
            '*.apiKey',
            '*.password',
            '*.secret',
            '*.token'
        ],
        censor: '[REDACTED]'
    },
    mixin() {
        const store = contextStorage.getStore();
        const context: Record<string, any> = {};

        // Auto-inject correlation ID and request ID
        if (store) {
            if (store.get('correlationId')) {
                context.correlationId = store.get('correlationId');
            }
            if (store.get('requestId')) {
                context.requestId = store.get('requestId');
            }
            if (store.get('jobId')) {
                context.jobId = store.get('jobId');
            }
            if (store.get('url')) {
                context.url = store.get('url');
            }
        }

        return context;
    }
});

export default logger;
