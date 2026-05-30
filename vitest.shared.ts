import { defineConfig } from 'vitest/config';

// Single source of truth for test timeout + worker-pool tuning across every
// package. Per-package vitest.config.ts files mergeConfig() this and add only
// their own `include` (root also adds `coverage`). Raising the timeout here
// and capping forks is the root-cause fix for the recurring full-turbo
// parallel-load flake.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    pool: 'forks',
    // minForks must be <= maxForks: vitest's default minForks tracks CPU count
    // (24 on this box) and would otherwise exceed a bare maxForks cap, throwing
    // "minThreads and maxThreads must not conflict". 1 lets the pool scale down.
    poolOptions: { forks: { minForks: 1, maxForks: 12 } },
  },
});
