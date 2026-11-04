import { defineConfig } from 'vitest/config';
import path from 'path';

/** Smoke tests against `next start`; see e2e/smoke/globalSetup.ts for what it needs running. */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['e2e/smoke/**/*.smoke.ts'],
        globalSetup: ['e2e/smoke/globalSetup.ts'],
        testTimeout: 30_000,
        hookTimeout: 90_000,
        fileParallelism: false,
        sequence: { concurrent: false },
    },
    resolve: {
        alias: {
            '@lemonade/core': path.resolve(__dirname, './packages/core/src/index.ts'),
            '@lemonade/infrastructure/src': path.resolve(__dirname, './packages/infrastructure/src'),
        },
    },
});
