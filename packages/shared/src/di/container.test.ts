import { describe, it, expect, beforeEach } from 'vitest';
import { ServiceContainer, createToken, Tokens } from './container.js';

describe('ServiceContainer', () => {
    let container: ServiceContainer;

    beforeEach(() => {
        container = ServiceContainer.getInstance();
        container.clear();
    });

    it('should be a singleton', () => {
        const instance1 = ServiceContainer.getInstance();
        const instance2 = ServiceContainer.getInstance();
        expect(instance1).toBe(instance2);
    });

    it('should register and resolve a singleton', () => {
        const TestToken = createToken<string>('TestService');
        const factory = () => 'test-value';

        container.registerFactory(TestToken, factory, 'singleton');

        const value1 = container.resolve(TestToken);
        const value2 = container.resolve(TestToken);

        expect(value1).toBe('test-value');
        expect(value1).toBe(value2); // Same instance
    });

    it('should register and resolve a transient service', () => {
        const RandomToken = createToken<number>('RandomService');
        const factory = () => Math.random();

        container.registerFactory(RandomToken, factory, 'transient');

        const value1 = container.resolve(RandomToken);
        const value2 = container.resolve(RandomToken);

        expect(value1).not.toBe(value2); // Different instances
    });

    it('should handle circular dependencies', () => {
        const AToken = createToken<any>('ServiceA');
        const BToken = createToken<any>('ServiceB');

        const factoryA = (c: ServiceContainer) => c.resolve(BToken);
        const factoryB = (c: ServiceContainer) => c.resolve(AToken);

        container.registerFactory(AToken, factoryA, 'singleton');
        container.registerFactory(BToken, factoryB, 'singleton');

        expect(() => container.resolve(AToken)).toThrow(/Circular dependency/);
    });

    it('should support scoped services', () => {
        const ScopeToken = createToken<object>('ScopedService');
        container.registerFactory(ScopeToken, () => ({}), 'scoped');

        const scope1 = container.createScope();
        const scope2 = container.createScope();

        const instance1 = container.resolve(ScopeToken, scope1);
        const instance1b = container.resolve(ScopeToken, scope1);
        const instance2 = container.resolve(ScopeToken, scope2);

        expect(instance1).toBe(instance1b); // Same in scope 1
        expect(instance1).not.toBe(instance2); // Different in scope 2
    });

    it('should throw when resolving scoped service without scope', () => {
        const ScopeToken = createToken<object>('ScopedService');
        container.registerFactory(ScopeToken, () => ({}), 'scoped');

        expect(() => container.resolve(ScopeToken)).toThrow(/is scoped but no scope provided/);
    });
});
