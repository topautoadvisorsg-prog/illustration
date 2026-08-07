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
    // Production-safety gate. Runs before every test file and aborts the run
    // if the environment can reach a production database, API, or bucket.
    // Do not remove to "make tests run" — that is the failure it prevents.
    setupFiles: ['./vitest.setup.ts'],
    server: {
      deps: {
        inline: [],
      },
    },
  },
});
