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
    /**
     * OPERATOR TESTS ARE NOT PART OF THE PORTABLE GATE.
     *
     * `*.operator.test.ts` files assert against real commercial manuscripts that
     * live outside this repository, on one operator's machine. They are genuine
     * regression tests and worth keeping, but they cannot be a CI gate: the
     * files drift as books are edited, and on any other machine they are simply
     * absent.
     *
     * Run them deliberately, on the machine that holds the books:
     *
     *   OPERATOR_TESTS=1 npx vitest run src/__tests__/real-manuscript.operator.test.ts
     *
     * The exclusion is conditional rather than absolute because an exclusion you
     * cannot switch off is a test nobody ever runs again.
     *
     * Everything the portable suite needs lives in
     * `src/__tests__/fixtures/fixture-book/`, which this repository owns.
     */
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      ...(process.env.OPERATOR_TESTS === '1' ? [] : ['src/**/*.operator.test.ts']),
    ],
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
