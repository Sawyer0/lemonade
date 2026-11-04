import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/*.spec.ts', 'mobile/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'json-summary', 'html'],
            include: ['src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts', 'agent/src/**/*.ts', 'functions/src/**/*.ts'],
            exclude: [
                '**/__tests__/**',
                '**/*.test.ts',
                '**/*.d.ts',
                '**/scripts/**',
                'packages/infrastructure/src/observability/data/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@lemonade/core': path.resolve(__dirname, './packages/core/src/index.ts'),
            '@lemonade/core/*': path.resolve(__dirname, './packages/core/src/*'),
            '@lemonade/infrastructure': path.resolve(__dirname, './packages/infrastructure/src/index.ts'),
            '@lemonade/infrastructure/*': path.resolve(__dirname, './packages/infrastructure/src/*'),
        },
    },
});
