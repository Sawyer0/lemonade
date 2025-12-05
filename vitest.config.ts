import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: [], // We might add a setup file later
        include: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
});
