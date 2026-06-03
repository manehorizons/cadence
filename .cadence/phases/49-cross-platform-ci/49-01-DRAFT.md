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

> **Scope deviation (CI verdict, 2026-06-03):** PR #19's first CI run proved the realpath fix — **macOS (both Node legs) and ubuntu went green, and it also fixed the Windows `recommendation` tests.** But the windows-latest leg surfaced *different, deeper* issues than this DRAFT scoped: `settle-security-audit.test.ts` AC-4 and `dispatcher.test.ts` ("caps at 100 entries") exceed the vitest timeout on Windows runners, and temp cleanup hits `EBUSY` (open handle) past the fixture's rm retry budget. Per operator decision ("land macOS, defer Windows"), this phase **ships the macOS unblock only**: AC-1 + AC-3 (re-scoped to ubuntu + macOS) deliver; **AC-2 and the Windows leg are dropped from this phase** and tracked as `rec-20260603-001`. The speculative `atomic-write` backoff change (T2) was reverted — it was Windows-justified and a likely regressor for the 100-write dispatcher test.

## Acceptance Criteria

### AC-1: temp-repo fixture root is canonical (macOS realpath)
Given `tempRepo()` from `@manehorizons/cadence-testkit`,
When it returns a fixture,
Then `fixture.root` equals its own `realpath` (no unresolved symlink components, so a child process spawned with `cwd: root` reporting `process.cwd()` matches the path tests read back), and `initialized: true` scaffolding still lands under that canonical root.

### AC-2: ~~atomic-write rename survives transient handle failures (Windows race)~~ — DROPPED → rec-20260603-001
~~Given a `rename` that transiently fails…~~ **Deferred.** The Windows transient-handle race is real but the fix needs Windows-verifiable iteration the macOS unblock should not wait on; tracked as `rec-20260603-001`. T2 reverted to `main`.

### AC-3: CI runs the full gate on ubuntu + macOS
Given `.github/workflows/ci.yml`,
When the `test` job's matrix is read,
Then it spans `os: [ubuntu-latest, macos-latest]` × `node: [20, 22]` with `runs-on: ${{ matrix.os }}` and `fail-fast: false`, the deferral comment names the still-deferred windows-latest leg + its tracked follow-up, and the `ci-success` aggregate job is preserved unchanged. A guard test asserts ubuntu + macOS are present (windows intentionally not yet asserted).

## Tasks

### T1: realpath the temp-repo fixture root
- files: `packages/testkit/src/fixture.ts`, `packages/testkit/tests/fixture.test.ts`
- action: Import `realpath` from `node:fs/promises`; set `const root = await realpath(await mkdtemp(join(tmpdir(), 'cadence-test-')))` so the returned root is OS-canonical before any scaffolding. No other behavior change (cleanup still `rm(root, …)`).
- verify: `pnpm --filter @manehorizons/cadence-testkit test -- tests/fixture.test.ts`
- done: AC-1

### T2: ~~injectable, higher-headroom rename retry~~ — REVERTED → rec-20260603-001
- files: `packages/core/src/state/atomic-write.ts`, `packages/core/tests/state/atomic-write.test.ts`
- status: Built + green on Linux/macOS, then **reverted to `main`** when the CI verdict showed Windows needs more than a backoff bump (and the bump likely hurt the 100-write dispatcher test). Re-attempt inside the Windows follow-up where it can be Windows-verified.
- done: ~~AC-2~~ (dropped)

### T3: re-enable macOS CI leg + guard test (windows deferred)
- files: `.github/workflows/ci.yml`, `packages/core/tests/docs/ci-matrix.test.ts` (new)
- action: Set the `test` job matrix to `os: [ubuntu-latest, macos-latest]` × `node: [20, 22]`, `runs-on: ${{ matrix.os }}`, `fail-fast: false`; rewrite the comment to record the macOS unblock and the still-deferred windows-latest leg (timeout + EBUSY harness work, tracked in the ledger); leave the `ci-success` job intact. Add a doc-contract test asserting the matrix names `ubuntu-latest` + `macos-latest`.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/docs/ci-matrix.test.ts`  (and PR CI: macOS legs green)
- done: AC-3
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/docs/ci-matrix.test.ts`
- done: AC-3

## Boundaries

- DO NOT change any product behavior: no edits to the gate engine/registry, the DRAFT→BUILD→SETTLE state machine, verifier selection, or any error semantics. T2 only widens the *resilience* of an existing retry; the success path is byte-identical.
- DO NOT remove or weaken the `ci-success` aggregate job — it is the single stable status context for branch protection; the matrix widens beneath it.
- DO NOT claim macOS/Windows green from local runs — only the Linux suite is locally verifiable here; the PR's macOS/Windows legs are the real gate (state this in the SUMMARY + PR).
- DO NOT alter the `mock` verifier default, vitest worker caps, or per-test timeouts (`vitest.shared.ts` stays the single source of truth).
- Touch only the files listed above; leave `.cadence/` live state, `launch/`, `ARCHITECTURE-BRIEF.md`, `OBJECTION-FAQ.md`, and unrelated docs untouched.
