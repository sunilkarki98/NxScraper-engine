/**
 * Global test setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Global test timeout
beforeAll(() => {
    // Increase timeout for integration tests if needed
    // vi.setConfig({ testTimeout: 10000 });
});

// Cleanup after all tests
afterAll(() => {
    // Close database connections, etc.
});

// Reset state before each test
beforeEach(() => {
    // Clear mocks, reset state
});

// Cleanup after each test
afterEach(() => {
    // Clear any test data
});

declare global {
    // eslint-disable-next-line no-var
    var testHelpers: any;
}

// Make test utilities available globally
global.testHelpers = {
    // Add global test helpers here
};
