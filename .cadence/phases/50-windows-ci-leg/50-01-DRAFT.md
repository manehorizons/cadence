---
phase: 50-windows-ci-leg
id: 50-01
tier: standard
status: PENDING
---

# 50-01 — Windows CI leg

## Objective

Make the test suite pass on `windows-latest` and re-enable that CI leg, by giving the two genuinely-slow test groups platform-aware timeout headroom (single source of truth) and making the temp-repo fixture cleanup tolerate Windows handle-locking — without per-test timeout band-aids and without changing product behavior.

> Source: `rec-20260603-001` (phase 49 deferral). **Diagnosis from PR #19 CI run 26912393990 (windows-latest):** the realpath fix already made macOS+ubuntu green and fixed the Windows `recommendation` tests. The remaining Windows failures are slowness, not logic: (a) `settle-security-audit.test.ts` — 4 tests spawn the built CLI + run real `git` per AC; *passing* ones already take 23–24s, two tip over the existing `{timeout:30_000}` (31.8s/32.0s); (b) `dispatcher.test.ts` "caps at 100 entries" does 105 sequential atomic state writes → 20.6s vs the 20s global; (c) `EBUSY` on temp-cleanup `rmdir` is **secondary** — a timed-out test leaves a child/file handle open. **Verification:** Windows is not reproducible on the Linux dev box; iteration is via a temporary windows-only CI fast-lane on the PR (operator decision), replaced by the real `windows-latest` matrix leg + a full run before merge.

## Acceptance Criteria

### AC-1: platform-aware test timeout (single source of truth)
Given `vitest.shared.ts` (the canonical timeout source merged by every package),
When it loads on a `win32` runner,
Then `testTimeout`/`hookTimeout` are raised by a documented win32 multiplier (≥3×, i.e. ≥60s) while non-win32 keeps the existing 20s — no per-test timeout is added anywhere new. The `settle-security-audit` describe's existing slow-test override is likewise made platform-aware (win32 ≥90s; non-win32 keeps 30s).

### AC-2: temp-repo cleanup tolerates Windows handle-locking
Given a `tempRepo()` fixture whose temp root still has an open handle at cleanup time (the Windows `EBUSY` case),
When `cleanup()` runs,
Then it retries with a raised budget and, on `win32` only, swallows a final cleanup failure (best-effort — OS GCs the temp root) rather than throwing; on non-win32 a cleanup failure still throws (no behavior change off Windows). The happy-path cleanup still removes the dir.

### AC-3: windows-latest re-enabled and green
Given `.github/workflows/ci.yml`,
When the `test` job matrix is read after this phase,
Then it spans `os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [20, 22]`, the temporary fast-lane probe job/workflow has been removed, the `ci-success` aggregate is preserved, and the `ci-matrix.test.ts` guard again asserts all three OS labels. (Acceptance gate: all six matrix legs green on the PR.)

## Tasks

### T1: platform-aware timeout in vitest.shared.ts + security-audit override
- files: `vitest.shared.ts`, `packages/core/tests/cli/settle-security-audit.test.ts`
- action: In `vitest.shared.ts` compute `const isWin = process.platform === 'win32'` and set `testTimeout`/`hookTimeout` to `isWin ? 60_000 : 20_000` (comment why). In `settle-security-audit.test.ts` change the describe option to `{ timeout: process.platform === 'win32' ? 90_000 : 30_000 }`. No `maxForks`/pool changes.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/cli/settle-security-audit.test.ts` (green on Linux at 30s; behavior unchanged off-Windows)
- done: AC-1

### T2: best-effort temp-repo cleanup
- files: `packages/testkit/src/fixture.ts`, `packages/testkit/tests/fixture.test.ts`
- action: Raise the cleanup `rm` budget (e.g. `maxRetries: 10, retryDelay: 200`) and wrap it so a final failure is swallowed **only on win32** (best-effort; document that the OS GCs temp roots), re-thrown elsewhere. Add a test asserting happy-path cleanup still removes the dir (Linux) — the win32 swallow path is covered by CI.
- verify: `pnpm --filter @manehorizons/cadence-testkit test -- tests/fixture.test.ts`
- done: AC-2

### T3: temporary windows-only fast-lane probe (iteration scaffold)
- files: `.github/workflows/_windows-probe.yml` (new, temporary)
- action: Add a windows-latest-only workflow (trigger: push to this branch) that installs, builds, and runs ONLY the affected files (`settle-security-audit.test.ts`, `dispatcher.test.ts`, `fixture.test.ts`) under Node 20 for ~2–3min feedback rounds. **This file is deleted in T4 before merge** — it is iteration scaffolding, not a kept artifact.
- verify: PR CI — the `_windows-probe` job goes green after T1+T2.
- done: (supports AC-3; removed in T4)

### T4: re-enable windows-latest matrix leg + restore guard, remove probe
- files: `.github/workflows/ci.yml`, `.github/workflows/_windows-probe.yml` (delete), `packages/core/tests/docs/ci-matrix.test.ts`
- action: Once the probe is green, add `windows-latest` back to the ci.yml matrix (→ `[ubuntu-latest, macos-latest, windows-latest]`), update the comment to drop the deferral note, delete `_windows-probe.yml`, and restore the `ci-matrix.test.ts` assertion that all three OS labels are present.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/docs/ci-matrix.test.ts` (Linux) + PR CI: all six matrix legs green.
- done: AC-3

## Boundaries

- DO NOT change product behavior: no edits to the gate engine/registry, the state machine, the skill-audit FIFO cap (stays 100), `renameWithRetry`/atomic-write semantics, or verifier selection. The fix is test-harness timeout/cleanup + CI config only.
- DO NOT re-introduce a per-test timeout band-aid: timeout changes live in `vitest.shared.ts` (the single source) and the one pre-existing slow-suite override, both made platform-aware. Do not sprinkle `{ timeout }` onto individual `it()`s.
- DO NOT change the non-win32 cleanup contract: off Windows, a cleanup failure must still throw.
- DO NOT re-add the reverted phase-49 `atomic-write` backoff bump — it would *worsen* the 105-write dispatcher test.
- DO NOT leave `_windows-probe.yml` in the tree at merge — it is temporary iteration scaffolding (T4 removes it).
- Touch only the files listed; leave `.cadence/` live state, `launch/`, and unrelated docs untouched.
