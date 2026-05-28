import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Resolve .js → .ts at test time so production-style ESM imports
    // (with explicit .js extensions) work under Vite's TS resolver.
    extensions: ['.ts', '.tsx', '.mjs', '.js', '.json'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    server: {
      deps: {
        inline: [],
      },
    },
  },
});
