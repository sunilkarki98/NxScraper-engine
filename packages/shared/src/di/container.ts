/**
 * Production-Grade Dependency Injection Container
 * 
 * Features:
 * - Factory registration (lazy loading)
 * - Singleton, transient, and scoped lifecycles
 * - Type safety
 * - Circular dependency detection
 * - Constructor injection support
 */

import logger from '../utils/logger.js';

// ============================================
// Types
// ============================================

export type ServiceToken<T = any> = string & { __type?: T };

export type Lifecycle = 'singleton' | 'transient' | 'scoped';

export type Factory<T> = (container: ServiceContainer) => T | Promise<T>;

export interface ServiceRegistration<T> {
    factory: Factory<T>;
    lifecycle: Lifecycle;
    instance?: T;
    resolving?: boolean; // For circular dependency detection
}

// ============================================
// Enhanced Service Container
// ============================================

export class ServiceContainer {
    private services = new Map<string, ServiceRegistration<any>>();
    private scopes = new WeakMap<object, Map<string, any>>();
    private static instance: ServiceContainer;

    private constructor() { }

    static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }

    /**
     * Register a service factory
     */
    registerFactory<T>(
        token: ServiceToken<T>,
        factory: Factory<T>,
        lifecycle: Lifecycle = 'singleton'
    ): void {
        if (this.services.has(token)) {
            logger.warn(`Service ${token} is already registered. Overwriting...`);
        }

        this.services.set(token, {
            factory,
            lifecycle,
            resolving: false
        });

        logger.debug(`DI: Registered ${token} (${lifecycle})`);
    }

    /**
     * Register a service instance (shorthand for singleton with value)
     */
    register<T>(token: ServiceToken<T>, instance: T): void {
        this.registerFactory(token, () => instance, 'singleton');
    }

    /**
     * Resolve a service
     */
    resolve<T>(token: ServiceToken<T>, scope?: object): T {
        const registration = this.services.get(token);

        if (!registration) {
            throw new Error(`Service not found: ${token}. Did you forget to register it?`);
        }

        // Check for circular dependencies
        if (registration.resolving) {
            throw new Error(`Circular dependency detected for service: ${token}`);
        }

        try {
            // Singleton: return cached instance
            if (registration.lifecycle === 'singleton') {
                if (!registration.instance) {
                    registration.resolving = true;
                    registration.instance = this.createInstance(registration.factory);
                    registration.resolving = false;
                }
                return registration.instance as T;
            }

            // Scoped: return instance from scope or create new
            if (registration.lifecycle === 'scoped') {
                if (!scope) {
                    throw new Error(`Service ${token} is scoped but no scope provided`);
                }

                let scopeCache = this.scopes.get(scope);
                if (!scopeCache) {
                    scopeCache = new Map();
                    this.scopes.set(scope, scopeCache);
                }

                if (!scopeCache.has(token)) {
                    registration.resolving = true;
                    const instance = this.createInstance(registration.factory);
                    scopeCache.set(token, instance);
                    registration.resolving = false;
                }

                return scopeCache.get(token) as T;
            }

            // Transient: always create new instance
            registration.resolving = true;
            const instance = this.createInstance(registration.factory);
            registration.resolving = false;
            return instance as T;

        } catch (error) {
            registration.resolving = false;
            throw error;
        }
    }

    /**
     * Create instance from factory (handles async)
     */
    private createInstance<T>(factory: Factory<T>): T {
        const result = factory(this);

        // If factory returns a promise, we need to handle it
        if (result instanceof Promise) {
            throw new Error('Async factories not yet supported. Use registerAsync() instead.');
        }

        return result;
    }

    /**
     * Check if a service is registered
     */
    has(token: ServiceToken): boolean {
        return this.services.has(token);
    }

    /**
     * Get all registered service tokens
     */
    getRegisteredServices(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Clear all services (for testing)
     */
    clear(): void {
        // Clear instances
        for (const [token, registration] of this.services.entries()) {
            if (registration.instance && typeof (registration.instance as any).dispose === 'function') {
                try {
                    (registration.instance as any).dispose();
                } catch (error) {
                    logger.warn({ error, token }, 'Failed to dispose service');
                }
            }
        }

        this.services.clear();
        logger.debug('DI: Container cleared');
    }

    /**
     * Create a child container (for scoping)
     */
    createScope(): object {
        return {};
    }

    /**
     * Dispose a scope and all its scoped instances
     */
    disposeScope(scope: object): void {
        const scopeCache = this.scopes.get(scope);
        if (scopeCache) {
            for (const [token, instance] of scopeCache.entries()) {
                if (instance && typeof instance.dispose === 'function') {
                    try {
                        instance.dispose();
                    } catch (error) {
                        logger.warn({ error, token }, 'Failed to dispose scoped service');
                    }
                }
            }
            this.scopes.delete(scope);
        }
    }
}

// ============================================
// Global Container Instance
// ============================================

export const container = ServiceContainer.getInstance();

// ============================================
// Service Tokens (Type-safe)
// ============================================

export const Tokens = {
    // Core Infrastructure
    Config: 'Config' as ServiceToken<any>,
    Logger: 'Logger' as ServiceToken<any>,

    // Database & Caching
    Dragonfly: 'Dragonfly' as ServiceToken<any>,
    CacheService: 'CacheService' as ServiceToken<any>,

    // Queue & Workers
    QueueManager: 'QueueManager' as ServiceToken<any>,
    QueueWorker: 'QueueWorker' as ServiceToken<any>,
    ScraperManager: 'ScraperManager' as ServiceToken<any>,

    // Auth & Security
    ApiKeyManager: 'ApiKeyManager' as ServiceToken<any>,
    CaptchaSolver: 'CaptchaSolver' as ServiceToken<any>,

    // Services
    ProxyManager: 'ProxyManager' as ServiceToken<any>,
    ProxyService: 'ProxyService' as ServiceToken<any>,
    RateLimiter: 'RateLimiter' as ServiceToken<any>,

    // Browser
    BrowserPool: createToken<any>('BrowserPool'),
    BrowserPoolScaler: 'BrowserPoolScaler' as ServiceToken<any>,

    // AI
    AIEngine: createToken<any>('AIEngine'),
    EmbeddingService: 'EmbeddingService' as ServiceToken<any>,
    VectorStore: 'VectorStore' as ServiceToken<any>,
    EventBus: 'EventBus' as ServiceToken<any>,

    // Sessions
    SessionManager: 'SessionManager' as ServiceToken<any>,

    // Orchestration
    RouterStats: 'RouterStats' as ServiceToken<any>,

    // Other
    RequestBatcher: 'RequestBatcher' as ServiceToken<any>,
    EvasionService: 'EvasionService' as ServiceToken<any>,
    CircuitBreakerService: 'CircuitBreakerService' as ServiceToken<any>,
    GridService: 'GridService' as ServiceToken<any>
} as const;

// ============================================
// Helper: Create typed token
// ============================================

export function createToken<T>(name: string): ServiceToken<T> {
    return name as ServiceToken<T>;
}
