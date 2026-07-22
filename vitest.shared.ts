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
//
// 60000 stopped being enough headroom under concurrent CI load: the
// dispatcher cap test (105 sequential dispatch() calls, each doing multiple
// disk read/writes) timed out twice in a row on windows-latest/Node 22 at
// ~61s (2026-07-22, PR #278 post-merge run) while every other OS/Node leg
// passed comfortably. Bumped to 90000 for more margin.
const TIMEOUT_MS = process.platform === 'win32' ? 90000 : 20000;

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
    pool: 'forks',
    // minForks must be <= maxForks: vitest's default minForks tracks CPU count
    // (24 on this box) and would otherwise exceed a bare maxForks cap, throwing
    // "minThreads and maxThreads must not conflict". 1 lets the pool scale down.
    poolOptions: { forks: { minForks: 1, maxForks: 12 } },
  },
});
