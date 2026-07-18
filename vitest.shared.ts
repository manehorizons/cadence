import { defineConfig } from 'vitest/config';

// Single source of truth for test timeout + worker-pool tuning across every
// package. Per-package vitest.config.ts files mergeConfig() this and add only
// their own `include` (root also adds `coverage`). Raising the timeout here
// and capping forks is the root-cause fix for the recurring full-turbo
// parallel-load flake.
//
// Windows runners are markedly slower for child-process spawn + git + repeated
// atomic file writes, so the same tests that pass comfortably on Linux/macOS
// brush the 20s ceiling (CLI-spawning settle tests, the 105-write dispatcher
// cap test). Scale the timeout up on win32 here — in the single source of
// truth — rather than sprinkling per-test `{ timeout }` band-aids.
const TIMEOUT_MS = process.platform === 'win32' ? 60000 : 20000;

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
    pool: 'forks',
    // Vitest 4's pool rework flattened poolOptions.<pool>.{minForks,maxForks}
    // into a single top-level maxWorkers cap (no min/max-conflict footgun to
    // manage anymore — see https://vitest.dev/guide/migration#pool-rework).
    maxWorkers: 12,
  },
});
