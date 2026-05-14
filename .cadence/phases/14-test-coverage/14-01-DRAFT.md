---
phase: 14-test-coverage
id: 14-01
tier: standard
status: PENDING
---

# 14-01 — test-coverage proof verifier

## Objective

Land the structural-floor verifier that DESIGN.md Section 3.2 calls mandatory: every AC must be backed by at least one test that names it. `settle` refuses to mark an AC pass without proof.

## Acceptance Criteria

### AC-1: AC↔test linkage convention is documented + scanned
Given a project's test files (`packages/**/*.test.ts` by default; configurable)
When the linkage scanner runs
Then each test whose `describe()` / `it()` / file content references an AC id token (e.g. `AC-1`, `(AC-2)`, `AC-3:`) is collected; the scanner returns `Map<AcId, TestRef[]>` where each `TestRef` has `{ file, line, snippet }`. The convention is documented in `DESIGN.md` Section 3.2 + a paragraph in the root `README.md`.

### AC-2: gate fires when 'test-coverage' is in the effective gate set
Given a phase whose effective `GateSet` (from `gatesFor`) contains `'test-coverage'`
When `cadence settle run` (default = `--auto`) executes
Then for every AC the verifier expects ≥1 linked test; if any AC has zero linked tests, settle refuses with exit 1 and stderr lists each offending AC + the test files searched. The refusal message names the convention so the user knows how to fix it. `--allow-missing-coverage` overrides per-invocation.

### AC-3: gate is skipped when not in the gate set
Given a phase with profile=`auto` × tier=`quick-fix` (effective gates exclude `'test-coverage'`)
When `cadence settle run --auto` executes
Then no test-coverage check runs and behavior matches today's structural-only settle — no false-positive refusal, no extra stderr noise.

### AC-4: scanner config is overridable
Given a project that organizes tests under a non-default path (e.g. `apps/api/__tests__`)
When `.cadence/config.json` sets `verification.testGlobs: string[]`
Then the scanner walks those globs instead of (or in addition to, per a `mode: 'replace' | 'extend'` flag) the defaults. Schema validation guards the field.

### AC-5: settle integration preserves explicit `--ac` overrides
Given a user passes `--ac AC-1=pass:override-note` alongside `--auto`
When settle runs with `'test-coverage'` in the gate set and AC-1 has no linked test
Then the explicit override wins; the gate refuses only on ACs that are *not* explicitly overridden. The auto-derived path for non-overridden ACs still requires coverage.

### AC-6: full suite green + dogfood
Given Phase 14 is complete
When `pnpm turbo run test` runs across the workspace
Then all tests pass at the new count (~251 → ~270+). `cadence settle run --auto` on this very phase's DRAFT passes only because Phase 14 itself lands tests that name AC-1..AC-6 (the dogfood proof).

## Tasks

### T1: scanner + linkage map
- files: `packages/core/src/verify/coverage.ts` (new), `packages/core/tests/verify/coverage.test.ts` (new)
- action: Implement `scanTestCoverage(root, opts: { globs?: string[] }): Promise<Map<AcId, TestRef[]>>`. Use `node:fs` + `node:path` + a minimal glob (no new dep — micromatch-like behavior via `**` / `*` only, or pull in `picomatch` if it's already transitive). Match `/\bAC-\d+\b/g` in test file contents. Return per-AC arrays of `{ file (relative), line, snippet }`. Tolerate zero matches (empty map). Tests cover: single test names one AC, single test names two ACs, multiple tests share an AC, no AC tokens anywhere → empty map.
- verify: vitest green; fixture-based with hand-rolled test files inside a temp dir.
- done: AC-1

### T2: settle integration — gate-checked refusal
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle-coverage.test.ts` (new)
- action: In the `--auto` path, after computing `effectiveGateSet`, check whether `'test-coverage'` is in the active gates. If yes: run `scanTestCoverage(repoRoot)` (or config-overridden globs); build the set of AC ids that are *not* explicitly overridden via `--ac`; refuse with exit 1 if any unoverriden AC has zero linked tests. Stderr lists offenders + the searched globs + the convention reminder. Add `--allow-missing-coverage` flag for explicit bypass. Tests: profile=standard × tier=standard refuses on uncovered ACs; profile=auto × tier=quick-fix lets the same DRAFT settle; explicit `--ac AC-1=pass:override` wins; `--allow-missing-coverage` bypasses entirely.
- verify: vitest green; new test file pulls in fixture DRAFTs + fixture test files.
- done: AC-2, AC-3, AC-5

### T3: config field for test globs
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`, `packages/core/src/verify/coverage.ts` (wire-up), `packages/core/tests/verify/coverage.test.ts` (extend)
- action: Add `verification: { testGlobs: string[] }` to `CadenceConfigZ` with default `['packages/**/*.test.ts', '**/*.test.ts']`. Coverage scanner reads it via `loadConfig`. Tests: custom globs work; bad glob types rejected by Zod.
- verify: vitest green; existing default config still parses.
- done: AC-4

### T4: docs + dogfood
- files: `DESIGN.md`, `README.md`
- action: In DESIGN.md Section 3.2, append the locked AC↔test convention: "tests must reference each AC id token (`AC-N`) in their file content — typically inside `describe()` or `it()` strings — to satisfy the test-coverage gate." Update DESIGN.md Section 10 to mark step 6 partially complete (test-coverage piece). README gains a `## Verification` section explaining the gate + override flags. Dogfood: ensure this very phase's test files reference AC-1..AC-6 so `cadence settle run --auto` against the DRAFT here (where Phase 14's own profile/tier puts `'test-coverage'` in the gate set under `standard`) passes self-verification.
- verify: visual read + dogfood: rerun `cadence settle run --auto --dry-run` (or just regular settle when ready) and confirm no coverage refusal.
- done: AC-1, AC-2, AC-6

### T5: full suite + coverage self-check
- files: (no edits)
- action: `pnpm turbo run test`. Expect ~270+ tests. Manually run the scanner against the keel/cadence repo to confirm: pre-existing tests aren't accidentally tagged (no false positives) AND Phase 14's own tests reference AC-1..AC-6 correctly (no false negatives).
- verify: green suite + scanner spot-check.
- done: AC-6

## Boundaries

- DO NOT implement `--deep` or `--interactive` verifiers — those are Phases 15 + 16. This is the *floor*.
- DO NOT enforce the soft cap on `auto × complex` here — Phase 14 only adds the test-coverage gate. The cap stays as a marker until a phase needs it.
- DO NOT change `--auto`'s structural verifier logic (tasks DONE → AC pass). Test-coverage is an *additional* check on top, not a replacement.
- DO NOT auto-rewrite tests to add AC tokens. The whole point is forcing the human/AI author to think about which tests prove which AC.
- DO NOT introduce a coverage-percentage metric (line/branch). The gate is binary per AC: at-least-one-linked-test or refuse.
- DO NOT touch the dashboard sibling. Coverage gate is upstream-only.
