import { vi } from 'vitest';
import type { Page } from 'playwright';

/**
 * Mock Playwright Page
 */
export function createMockPage(): Page {
    return {
        goto: vi.fn().mockResolvedValue(null),
        $: vi.fn(),
        $$: vi.fn(),
        evaluate: vi.fn(),
        content: vi.fn().mockResolvedValue('<html></html>'),
        close: vi.fn(),
        url: vi.fn().mockReturnValue('https://example.com'),
    } as any;
}

/**
 * Mock Request/Response
 */
export function createMockRequest(body: any = {}, query: any = {}, params: any = {}) {
    return {
        body,
        query,
        params,
        headers: {},
        id: 'test-request-id',
        ip: '127.0.0.1',
        path: '/test',
        method: 'GET',
        get: vi.fn((header) => {
            if (header === 'user-agent') return 'test-agent';
            return undefined;
        }),
    } as any;
}

export function createMockResponse() {
    const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        setHeader: vi.fn().mockReturnThis(),
    };
    return res;
}

/**
 * Mock Logger
 */
export const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
};

/**
 * Wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock credentials
 */
export function createMockCredentials() {
    return {
        username: 'testuser',
        password: 'testpass123',
    };
}
