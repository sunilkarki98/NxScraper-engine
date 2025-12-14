import { Server } from 'http';
import { Request, Response, NextFunction } from 'express';
import { logger } from '@nx-scraper/shared';
import { getMetrics } from '../observability/metrics.js';

export interface ShutdownHooks {
    beforeShutdown?: () => Promise<void>;
    onShutdown?: () => Promise<void>;
    afterShutdown?: () => Promise<void>;
}

class GracefulShutdown {
    private isShuttingDown = false;
    private server: Server | null = null;
    private hooks: ShutdownHooks = {};
    private shutdownTimeout = 30000; // 30 seconds

    /**
     * Register HTTP server  
     */
    setServer(server: Server): void {
        this.server = server;
    }

    /**
     * Register shutdown hooks
     */
    registerHooks(hooks: ShutdownHooks): void {
        this.hooks = { ...this.hooks, ...hooks };
    }

    /**
     * Set shutdown timeout
     */
    setTimeout(ms: number): void {
        this.shutdownTimeout = ms;
    }

    /**
     * Initialize graceful shutdown handlers
     */
    init(): void {
        // Handle termination signals
        process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));
        process.on('SIGINT', () => this.handleShutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error({ error }, 'Uncaught exception');
            this.handleShutdown('uncaughtException');
        });

        // Handle unhandled promise rejections  
        process.on('unhandledRejection', (reason) => {
            logger.error({ reason }, 'Unhandled promise rejection');
            this.handleShutdown('unhandledRejection');
        });

        logger.info('Graceful shutdown handlers initialized');
    }

    /**
     * Handle shutdown process
     */
    private async handleShutdown(signal: string): Promise<void> {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress, forcing exit...');
            process.exit(1);
        }

        this.isShuttingDown = true;
        logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

        // Set a hard timeout
        const forceExitTimeout = setTimeout(() => {
            logger.error('Graceful shutdown timeout exceeded, forcing exit');
            process.exit(1);
        }, this.shutdownTimeout);

        try {
            // Phase 1: Before shutdown hook
            if (this.hooks.beforeShutdown) {
                logger.info('Running before-shutdown hooks');
                await this.hooks.beforeShutdown();
            }

            // Phase 2: Stop accepting new connections
            if (this.server) {
                logger.info('Stopping HTTP server from accepting new connections');
                await this.closeServer();
            }

            // Phase 3: Custom shutdown logic
            if (this.hooks.onShutdown) {
                logger.info('Running shutdown hooks');
                await this.hooks.onShutdown();
            }

            // Phase 4: After shutdown cleanup
            if (this.hooks.afterShutdown) {
                logger.info('Running after-shutdown hooks');
                await this.hooks.afterShutdown();
            }

            // Clear timeout
            clearTimeout(forceExitTimeout);

            logger.info('Graceful shutdown completed successfully');
            process.exit(0);
        } catch (error: unknown) {
            logger.error({ error }, 'Error during graceful shutdown');
            clearTimeout(forceExitTimeout);
            process.exit(1);
        }
    }

    /**
     * Close HTTP server gracefully
     */
    private closeServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                return resolve();
            }

            this.server.close((err: Error | undefined) => {
                if (err) {
                    logger.error({ err }, 'Error closing HTTP server');
                    reject(err);
                } else {
                    logger.info('HTTP server closed successfully');
                    resolve();
                }
            });
        });
    }

    /**
     * Check if shutdown is in progress
     */
    isInProgress(): boolean {
        return this.isShuttingDown;
    }
}

// Singleton instance
export const gracefulShutdown = new GracefulShutdown();

/**
 * Ready check middleware - returns 503 during shutdown
 */
export function readyCheck(req: Request, res: Response, next: NextFunction) {
    if (gracefulShutdown.isInProgress()) {
        res.status(503).json({
            success: false,
            error: 'Server is shutting down',
        });
        return;
    }
    next();
}
