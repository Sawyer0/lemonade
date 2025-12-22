import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
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
