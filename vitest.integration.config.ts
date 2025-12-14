import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    test: {
        globals: true,
        root: __dirname,
        environment: 'node',
        setupFiles: ['./tests/integration/setup.ts'],
        testTimeout: 30000, // 30 seconds for real operations
        hookTimeout: 30000,
        teardownTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
            ],
        },
        include: ['tests/integration/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        pool: 'forks', // Run tests in separate processes
        fileParallelism: false, // One test at a time for integration
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './'),
            '@shared': resolve(__dirname, './packages/shared'),
            '@core': resolve(__dirname, './packages/core/src'),
        },
    },
});
