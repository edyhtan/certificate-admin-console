import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // One throwaway database per run (create → migrate → drop).
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/setup-env.ts'],
    // Test files share that database and reset it, so they run one at a time.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
