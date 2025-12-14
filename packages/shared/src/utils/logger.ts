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
    mixin() {
        const store = contextStorage.getStore();
        if (store) {
            return Object.fromEntries(store);
        }
        return {};
    }
});

export default logger;
