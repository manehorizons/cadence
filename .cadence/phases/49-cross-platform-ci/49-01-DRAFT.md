---
phase: 49-cross-platform-ci
id: 49-01
tier: standard
status: PENDING
---

# 49-01 — Cross-platform CI unblock

## Objective

Resolve the two test-harness portability defects that forced the macOS + Windows CI legs to be deferred — an unresolved `mkdtemp` root (macOS `/tmp`→`/private/tmp` realpath) and a thin atomic-write rename-retry budget (Windows transient handle race) — then re-enable both legs so the full lint/typecheck/test/build gate runs on all three OSes.

> Source: post-v1.5.1 operator's-choice pick (handoff `SESSION-2026-06-03-v1.5.1-shipped.md`) + the deferral noted in `.github/workflows/ci.yml`. **Verification note:** macOS/Windows behavior cannot be reproduced on the Linux dev box (its `tmpdir` already equals its realpath); the Linux suite stays green locally and the PR's macOS/Windows legs are the acceptance gate (operator decision: "both legs, PR is the gate").

## Acceptance Criteria

### AC-1: temp-repo fixture root is canonical (macOS realpath)
Given `tempRepo()` from `@manehorizons/cadence-testkit`,
When it returns a fixture,
Then `fixture.root` equals its own `realpath` (no unresolved symlink components, so a child process spawned with `cwd: root` reporting `process.cwd()` matches the path tests read back), and `initialized: true` scaffolding still lands under that canonical root.

### AC-2: atomic-write rename survives transient handle failures (Windows race)
Given a `rename` that transiently fails with `EPERM`/`EACCES`/`EBUSY` a bounded number of times then succeeds,
When the rename helper runs (with an injectable `rename` impl for test),
Then it retries and ultimately resolves; a non-retryable error (e.g. `ENOENT`) still throws immediately on the first attempt; and the documented total backoff budget across all attempts is at least 500 ms (raised headroom for slow Windows runners). The happy-path (`atomicWriteJSON` with the real `rename`) is unchanged.

### AC-3: CI runs the full gate on ubuntu + macOS + windows
Given `.github/workflows/ci.yml`,
When the `test` job's matrix is read,
Then it spans `os: [ubuntu-latest, macos-latest, windows-latest]` × `node: [20, 22]` with `runs-on: ${{ matrix.os }}` and `fail-fast: false`, the deferral comment is replaced with current intent, and the `ci-success` aggregate job is preserved unchanged. A guard test asserts all three OS labels are present in the workflow.

## Tasks

### T1: realpath the temp-repo fixture root
- files: `packages/testkit/src/fixture.ts`, `packages/testkit/tests/fixture.test.ts`
- action: Import `realpath` from `node:fs/promises`; set `const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-test-')))` so the returned root is OS-canonical before any scaffolding. No other behavior change (cleanup still `rm(root, …)`).
- verify: `pnpm --filter @manehorizons/cadence-testkit test -- tests/fixture.test.ts`
- done: AC-1

### T2: injectable, higher-headroom rename retry
- files: `packages/core/src/state/atomic-write.ts`, `packages/core/tests/state/atomic-write.test.ts`
- action: Export `renameWithRetry(tmp, path, opts?)` taking an optional `{ rename }` injection (defaults to `node:fs/promises` rename) and export `RENAME_BACKOFF_MS` / a `renameBackoffBudgetMs()` helper. Raise the retry headroom (bump base backoff and/or attempts) so the cumulative budget is ≥500 ms. Keep `atomicWrite` calling it with the real rename — happy path and `leaves no temp file` behavior unchanged.
- verify: `pnpm --filter @manehorizons/cadence-core build && pnpm --filter @manehorizons/cadence-core test -- tests/state/atomic-write.test.ts`
- done: AC-2

### T3: re-enable macOS + Windows CI legs + guard test
- files: `.github/workflows/ci.yml`, `packages/core/tests/docs/ci-matrix.test.ts` (new)
- action: Add `os: [ubuntu-latest, macos-latest, windows-latest]` to the `test` job matrix, set `runs-on: ${{ matrix.os }}`, keep `fail-fast: false` and `node: [20, 22]`; replace the deferral comment block with a one-line note that the gate runs on all three OSes; leave the `ci-success` job (branch-protection status context) intact. Add a doc-contract test (resolving repo-root `ci.yml` from the test file's URL) asserting the matrix names `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/docs/ci-matrix.test.ts`
- done: AC-3

## Boundaries

- DO NOT change any product behavior: no edits to the gate engine/registry, the DRAFT→BUILD→SETTLE state machine, verifier selection, or any error semantics. T2 only widens the *resilience* of an existing retry; the success path is byte-identical.
- DO NOT remove or weaken the `ci-success` aggregate job — it is the single stable status context for branch protection; the matrix widens beneath it.
- DO NOT claim macOS/Windows green from local runs — only the Linux suite is locally verifiable here; the PR's macOS/Windows legs are the real gate (state this in the SUMMARY + PR).
- DO NOT alter the `mock` verifier default, vitest worker caps, or per-test timeouts (`vitest.shared.ts` stays the single source of truth).
- Touch only the files listed above; leave `.cadence/` live state, `launch/`, `ARCHITECTURE-BRIEF.md`, `OBJECTION-FAQ.md`, and unrelated docs untouched.
