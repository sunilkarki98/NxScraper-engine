import logger from './logger.js';

export enum CircuitState {
    CLOSED,   // Normal operation
    OPEN,     // Failing, reject requests
    HALF_OPEN // Testing recovery
}

export interface CircuitBreakerOptions {
    failureThreshold: number; // Number of failures before opening
    cooldownMs: number;       // Time to wait before trying again (Half-Open)
    successThreshold: number; // Successes needed to close circuit
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private successCount = 0;
    private nextAttempt = 0;
    private readonly name: string;
    private readonly options: CircuitBreakerOptions;

    constructor(name: string, options: Partial<CircuitBreakerOptions> = {}) {
        this.name = name;
        this.options = {
            failureThreshold: options.failureThreshold || 5,
            cooldownMs: options.cooldownMs || 30000, // 30 seconds
            successThreshold: options.successThreshold || 2
        };
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() > this.nextAttempt) {
                this.transitionTo(CircuitState.HALF_OPEN);
            } else {
                if (fallback) {
                    return fallback();
                }
                throw new Error(`Circuit Breaker '${this.name}' is OPEN. Requests blocked.`);
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            if (fallback) {
                return fallback();
            }
            throw error;
        }
    }

    private onSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.options.successThreshold) {
                this.transitionTo(CircuitState.CLOSED);
            }
        } else {
            // In closed state, success just resets failure count if we want to be forgiving?
            // Usually we don't reset partial failure count on every success to avoid flapping,
            // but for simplicity let's keep it forgiving or implement a rolling window later.
            // For now: don't reset failure count immediately to allow burst tolerance, 
            // but maybe decay it? Let's just reset for simple "consecutive failures" logic.
            this.failureCount = 0;
        }
    }

    private onFailure(error: any) {
        this.failureCount++;
        logger.warn({ error, circuit: this.name, state: this.state }, 'Circuit breaker recorded failure');

        if (this.state === CircuitState.CLOSED && this.failureCount >= this.options.failureThreshold) {
            this.transitionTo(CircuitState.OPEN);
        } else if (this.state === CircuitState.HALF_OPEN) {
            this.transitionTo(CircuitState.OPEN);
        }
    }

    private transitionTo(newState: CircuitState) {
        this.state = newState;
        logger.info({ circuit: this.name, from: CircuitState[this.state], to: CircuitState[newState] }, 'Circuit state changed');

        if (newState === CircuitState.OPEN) {
            this.nextAttempt = Date.now() + this.options.cooldownMs;
        } else if (newState === CircuitState.CLOSED) {
            this.failureCount = 0;
            this.successCount = 0;
        } else if (newState === CircuitState.HALF_OPEN) {
            this.successCount = 0;
        }
    }
}
