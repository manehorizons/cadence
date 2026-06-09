---
phase: 89-doctor-handoff-retention
id: 89-89
tier: standard
status: PENDING
---

# 89-89 — Doctor handoff-retention check

## Objective

Add a read-only, best-effort `cadence doctor` `handoff-retention` check that makes SESSION-doc accumulation visible — pairing the v1.20 prune behavior with diagnostic visibility (the v1.18/v1.19 house pattern).

## Acceptance Criteria

### AC-1: within-budget → ok
Given `config.handoff.retain = N` and at most `N` `SESSION-*.md` docs present
When the `handoff-retention` check runs
Then it returns `ok` (`name: 'handoff-retention'`), its detail stating the count is within the retain budget.

### AC-2: over-budget but managed → ok with a self-heal note
Given `config.handoff.retain = N` and more than `N` `SESSION-*.md` docs
When the check runs
Then it returns `ok` (not a warning — retention is configured and the next handoff write self-heals), its detail noting the next write will prune the excess.

### AC-3: unmanaged accumulation → warning
Given `config.handoff.retain` is **unset** and at least the warn threshold (**10**) `SESSION-*.md` docs are present
When the check runs
Then it returns `warning` with a remediation suggesting `handoff.retain` (suggested 10) to enable auto-pruning, naming the observed count.

### AC-4: unset & below threshold (or no dir) → ok
Given `config.handoff.retain` is unset and fewer than 10 docs (or no `.cadence/handoff/` dir)
When the check runs
Then it returns `ok` (an absent dir / small archive is healthy), and never throws.

### AC-5: registered + best-effort in `runDoctor`
Given a full `cadence doctor` run
When `runDoctor` executes
Then the report includes a `handoff-retention` check, and any internal error (unreadable config/dir) degrades to `ok` rather than throwing — consistent with the `worktree-phases` best-effort posture.

## Tasks

### T1: implement `checkHandoffRetention`
- files: `packages/core/src/doctor/run.ts`
- action: add `checkHandoffRetention(root)` returning a `DoctorCheck`. Count `SESSION-*.md` in `.cadence/handoff/` (absent dir → 0). Load config best-effort. Apply the AC-1..AC-4 decision table with `WARN_THRESHOLD = 10`. Wrap in try/catch → `pass` on any error.
- verify: unit tests below.
- done: AC-1, AC-2, AC-3, AC-4

### T2: register in `runDoctor`
- files: `packages/core/src/doctor/run.ts`
- action: add `await checkHandoffRetention(root)` to the `runDoctor` checks array.
- verify: a `runDoctor` test asserts a `handoff-retention` check is present.
- done: AC-5

### T3: tests
- files: `packages/core/tests/doctor/handoff-retention.test.ts`
- action: tempRepo fixtures — seed N `SESSION-*.md` files + a config with/without `retain`; assert severity + detail/remediation per AC. Include the no-dir and error-degrades-to-ok cases.
- verify: `pnpm --filter @manehorizons/cadence-core test -- tests/doctor/handoff-retention.test.ts`
- done: AC-1, AC-2, AC-3, AC-4, AC-5

## Boundaries

- DO NOT change the prune behavior, `selectPrunable`, or `runHandoff` (Phase 88 — done).
- DO NOT make the check mutate anything — it is read-only (no deletion, no config writes).
- DO NOT add a manual `cadence handoff prune` command (out of scope / YAGNI).
- Keep the check best-effort: a diagnostic must never make `cadence doctor` throw.
