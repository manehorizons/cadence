import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Single source of truth for test timeout + worker-pool tuning (and, below,
// coverage) across every package. Per-package vitest.config.ts files
// mergeConfig() this and add only their own `include`. Raising the timeout
// here and capping forks is the root-cause fix for the recurring full-turbo
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

// Coverage thresholds, per package, measured 2026-07-23 via `vitest run
// --coverage` (phase 213, task T1) with a ~5-point safety margin subtracted
// and floored to a whole number. This file is imported identically by every
// package's own vitest.config.ts (`mergeConfig(shared, ...)`), but each
// package's `pnpm test` invocation (via `turbo run test`) runs `vitest run`
// with the *package's own directory* as cwd — never a single combined
// root-level run (root vitest.config.ts merges this same shared config but
// is not what CI executes; see the note on FALLBACK_THRESHOLDS below).
// That means this one shared file can still enforce a genuinely
// package-specific floor: at config-evaluation time we key off
// `path.basename(process.cwd())` to pick that package's own thresholds
// out of a single table, rather than applying one number to everyone
// uniformly (which would either be too loose for high-coverage packages or
// too tight for low-coverage ones) or duplicating threshold config into
// every package's own vitest.config.ts (which would defeat the
// single-source-of-truth pattern this file exists for).
//
// Measured coverage at time of writing (statements / branches / functions /
// lines): types 96.26/75.00/44.44/96.26, core 75.47/87.01/87.32/75.47,
// host-claude-code 72.58/90.09/84.61/72.58, host-codex 63.10/91.25/85.71/
// 63.10, testkit 89.47/83.33/83.33/89.47.
const COVERAGE_THRESHOLDS: Record<
  string,
  { statements: number; branches: number; functions: number; lines: number }
> = {
  types: { statements: 91, branches: 70, functions: 39, lines: 91 },
  core: { statements: 70, branches: 82, functions: 82, lines: 70 },
  'host-claude-code': { statements: 67, branches: 85, functions: 79, lines: 67 },
  'host-codex': { statements: 58, branches: 86, functions: 80, lines: 58 },
  testkit: { statements: 84, branches: 78, functions: 78, lines: 84 },
};

// Only used if vitest is invoked from a directory that doesn't match a known
// package name above — e.g. a manual root-level `vitest run`, which CI never
// does (turbo's `test` task always runs each package's own `vitest run`
// from within that package's directory). Falls back to the lowest
// per-metric threshold across all packages so a combined/aggregate run
// can't spuriously fail against a number tuned for a single package.
const FALLBACK_THRESHOLDS = { statements: 58, branches: 70, functions: 39, lines: 58 };

const currentPackage = path.basename(process.cwd());
const coverageThresholds =
  COVERAGE_THRESHOLDS[currentPackage] ?? FALLBACK_THRESHOLDS;

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
    coverage: {
      // `enabled: true` is required here because no package's `test` script
      // (or CI's `pnpm test` / `turbo run test`) passes the `--coverage`
      // CLI flag — without this, declaring `coverage.thresholds` alone would
      // be silently inert and AC-1 ("coverage thresholds ... exits non-zero
      // if measured coverage drops below") would never actually gate a run.
      enabled: true,
      provider: 'v8',
      include: ['src/**'],
      thresholds: coverageThresholds,
    },
  },
});
