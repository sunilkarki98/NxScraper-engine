import { container, Tokens } from '../di/container.js';
import logger from '../utils/logger.js';
import { DragonflyClient } from '../database/dragonfly-client.js';

export interface CircuitBreakerConfig {
    failureThreshold: number;
    cooldownSeconds: number;
    windowSeconds: number;
}

export class CircuitBreakerService {
    private config: CircuitBreakerConfig;

    constructor() {
        this.config = {
            failureThreshold: 10,
            cooldownSeconds: 300, // 5 minutes
            windowSeconds: 60     // 1 minute
        };
    }

    private get db(): DragonflyClient {
        return container.resolve(Tokens.Dragonfly);
    }

    /**
     * Check if the circuit is open for a specific domain
     */
    async isOpen(domain: string): Promise<boolean> {
        if (!domain) return false;

        const client = this.db.getClient();
        const openKey = `cb:open:${domain}`;

        try {
            const isOpen = await client.exists(openKey);
            if (isOpen) {
                logger.warn({ domain }, '🛑 Circuit Breaker: Domain is blocked');
                return true;
            }
            return false;
        } catch (error) {
            logger.error({ error, domain }, 'Circuit Breaker: Failed to check status');
            return false; // Fail open (allow traffic) if Redis is down
        }
    }

    /**
     * Record a successful request
     */
    async recordSuccess(domain: string): Promise<void> {
        if (!domain) return;

        // Optional: We could implement "Half-Open" logic here to close the circuit
        // But for simplicity with Redis, we just let the TTL expire.
        // We might want to decrement the failure count?
        // For now, doing nothing is simplest "Leaky Bucket" via TTL on failures.
    }

    /**
     * Record a failed request
     */
    async recordFailure(domain: string): Promise<void> {
        if (!domain) return;

        const client = this.db.getClient();
        const failureKey = `cb:failures:${domain}`;
        const openKey = `cb:open:${domain}`;

        try {
            // Increment failure count
            const count = await client.incr(failureKey);

            // Set expiry on first failure (Rolling Window)
            if (count === 1) {
                await client.expire(failureKey, this.config.windowSeconds);
            }

            // Check threshold
            if (count >= this.config.failureThreshold) {
                logger.error({ domain, count, threshold: this.config.failureThreshold }, '💥 Circuit Breaker: TRIP! Opening circuit.');

                // Open the Circuit
                await client.setex(openKey, this.config.cooldownSeconds, 'OPEN');
                // Reset counter
                await client.del(failureKey);
            }
        } catch (error) {
            logger.error({ error, domain }, 'Circuit Breaker: Failed to record failure');
        }
    }
}

// Factory for DI
export function createCircuitBreakerService(): CircuitBreakerService {
    return new CircuitBreakerService();
}

// Singleton
export const circuitBreakerService = new CircuitBreakerService();

// Register in DI Container
container.register(Tokens.CircuitBreakerService, circuitBreakerService);
