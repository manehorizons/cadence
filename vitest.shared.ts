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
// testkit 89.47/83.33/83.33/89.47.
//
// Re-measured 2026-07-25 (phase 222, final pass after T1/T2/T3 all landed):
// extracting routeHookEvent/the slash-command catalog/install.ts's merge
// logic/locate-self.ts out of host-claude-code's and host-codex's src/** into
// the new `host-toolkit` package moved large, well-covered chunks of code out
// of each adapter's own coverage denominator — nothing became less tested,
// the extracted code is simply covered inside host-toolkit now (99.01/94.11/
// 100/99.01). host-claude-code: 54.21/93.61/87.5/54.21. host-codex:
// 58.09/93.24/91.66/58.09. Both remaining low statements/lines numbers are
// dominated by each adapter's own `cli.ts` (0% — exercised only via spawned
// subprocess tests, which v8 coverage of the parent process can't see; a
// pre-existing characteristic, not introduced by this phase).
//
// Re-measured 2026-08-07 (phase 260, vitest v4 upgrade): Vitest 4's
// `@vitest/coverage-v8` turns on AST-aware remapping by default (previously
// experimental/opt-in), which maps V8's raw byte-range hit counts onto the
// real AST instead of the old cruder v8-to-istanbul conversion. This is a
// *measurement* change, not a behavior regression — same tests, same pass
// counts, same lines/functions genuinely exercised — but it recomputes the
// denominators from scratch: it finds substantially more real branches and
// functions than the old converter did (e.g. `core`'s branch total went
// 6291 -> 7249, functions 1132 -> 1799, confirmed by running the identical
// suite under both vitest 2.1.9 and 4.1.10), and it counts "statements" on a
// finer per-expression basis rather than roughly per-line, which shrinks the
// statement/line denominators for terse files. Every affected package's
// thresholds below were re-measured under vitest 4.1.10 via each package's
// real `pnpm test` invocation and re-derived with the same methodology this
// file has always used (measure, subtract a ~5-point safety margin, floor to
// a whole number) — nothing here loosens what's actually asserted; the old
// thresholds were calibrated against a coverage tool that undercounted
// branches/functions, and would otherwise permanently fail on the more
// accurate v4 numbers regardless of test quality. Newly measured
// (statements/branches/functions/lines): core 75.07/65.29/81.32/75.41,
// host-claude-code 47.2/55.29/57.14/49.09, host-codex
// 53.65/63.07/64.7/54.28, testkit 88.88/75/90/91.42. `types` and
// `host-toolkit` still clear their existing thresholds comfortably under v4
// and were left unchanged.
const COVERAGE_THRESHOLDS: Record<
  string,
  { statements: number; branches: number; functions: number; lines: number }
> = {
  types: { statements: 91, branches: 70, functions: 39, lines: 91 },
  core: { statements: 70, branches: 60, functions: 76, lines: 70 },
  'host-claude-code': { statements: 42, branches: 50, functions: 52, lines: 44 },
  'host-toolkit': { statements: 94, branches: 89, functions: 95, lines: 94 },
  'host-codex': { statements: 48, branches: 58, functions: 59, lines: 49 },
  testkit: { statements: 83, branches: 70, functions: 85, lines: 86 },
};

// Only used if vitest is invoked from a directory that doesn't match a known
// package name above — e.g. a manual root-level `vitest run`, which CI never
// does (turbo's `test` task always runs each package's own `vitest run`
// from within that package's directory). Falls back to the lowest
// per-metric threshold across all packages so a combined/aggregate run
// can't spuriously fail against a number tuned for a single package.
const FALLBACK_THRESHOLDS = { statements: 42, branches: 50, functions: 39, lines: 44 };

const currentPackage = path.basename(process.cwd());
const coverageThresholds =
  COVERAGE_THRESHOLDS[currentPackage] ?? FALLBACK_THRESHOLDS;

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: TIMEOUT_MS,
    hookTimeout: TIMEOUT_MS,
    // Auto-revert every `vi.stubEnv()` call before each test runs (vitest's
    // `onBeforeTryTask` calls `vi.unstubAllEnvs()` when this is on), on top
    // of any explicit `vi.unstubAllEnvs()` a test file's own afterEach
    // already does. This is defense-in-depth for `pool: 'forks'` below:
    // process.env is a live object shared by every test file a worker
    // happens to execute, so a stub a test forgets to unstub (a future
    // author's mistake, not a hypothetical today) would otherwise bleed
    // into whichever file the same forked worker runs next. Confirmed safe
    // to add repo-wide: at the time this was added, `vi.stubEnv` had zero
    // existing call sites in the repo (only the manual process.env
    // save/restore pattern it was introduced to replace), so no test
    // anywhere relies on a stub persisting across tests within a file.
    unstubEnvs: true,
    pool: 'forks',
    // Vitest 4's pool rework flattened per-pool min/max worker knobs
    // (poolOptions.<pool>.{minForks,maxForks}) into a single top-level cap:
    // https://vitest.dev/guide/migration#pool-rework
    maxWorkers: 12,
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
