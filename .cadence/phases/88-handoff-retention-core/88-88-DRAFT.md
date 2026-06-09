---
phase: 88-handoff-retention-core
id: 88-88
tier: standard
status: PENDING
---

# 88-88 — Handoff retention core + wiring

## Objective

Add opt-in, count-based retention that prunes stale `SESSION-*.md` docs at handoff-write time — deterministic, offline, best-effort, never silently destructive.

## Acceptance Criteria

### AC-1: `handoff.retain` config schema
Given a `.cadence/config.json` with a `handoff` block
When the config is parsed by `cadence-types`
Then `handoff.retain` accepts a positive integer (`int >= 1`), an unset `retain` means retention is **disabled** (no default keep-count), and `retain < 1` or non-integer is rejected at parse time. The block mirrors the `phaseGuard`/`logging` default shape so an absent `handoff` key parses cleanly.

### AC-2: pure `selectPrunable` selection
Given a list of `SESSION-*.md` filenames, a keep-count `N`, and the current (`lastHandoff`) filename
When `selectPrunable(filenames, N, current)` runs (pure, no I/O)
Then it returns the filenames to delete: everything except the newest `N` by lexicographic-descending order, and `current` is **always** excluded from the delete set even if it would otherwise fall outside the newest `N`. With `<= N` candidates it returns `[]`. It performs no filesystem access.

### AC-3: prune-on-write wiring
Given `config.handoff.retain = N` and more than `N` `SESSION-*.md` docs present after a handoff write
When `runHandoff` completes its write + `lastHandoff` stamp
Then the oldest docs beyond `N` are `unlink`ed (the just-written `lastHandoff` is never deleted), and `HandoffResult.pruned` lists the removed filenames. When `retain` is unset, nothing is pruned and `pruned` is `[]`.

### AC-4: pruning is best-effort, never fails the handoff
Given retention is enabled but a prune step throws (e.g. an `unlink`/config-load error)
When `runHandoff` runs
Then the handoff still succeeds — the new doc is written and stamped, the error is swallowed into a soft signal (not rethrown), and the function returns normally. Mirrors the `gatherOccupancy` best-effort posture.

### AC-5: pruning is reported
Given a handoff write that pruned one or more docs
When the CLI/`handoffService` reports the result
Then it prints the write line followed by a `handoff: pruned <n> stale doc(s): <names>` line; when nothing was pruned, no prune line is printed.

## Tasks

### T1: `handoff.retain` config schema
- files: `packages/types/src/config.ts`, `packages/types/tests/config.test.ts`
- action: add a `handoff: z.object({ retain: z.number().int().min(1).optional() }).default({})` block; add `handoff: {}` to `defaultConfig` and confirm presets inherit. Reject `retain < 1` / non-int.
- verify: parse tests — valid `retain`, omitted block, `retain: 0` rejected, `retain: 1.5` rejected.
- done: AC-1

### T2: pure `selectPrunable`
- files: `packages/core/src/handoff/retention.ts`, `packages/core/tests/handoff/retention.test.ts`
- action: implement the pure selector (lexicographic-desc, keep newest N, always exclude `current`). No fs imports.
- verify: unit tests for keep-newest, current-always-kept-even-if-old, `<= N` → `[]`, stable ordering.
- done: AC-2

### T3: wire prune into `runHandoff`
- files: `packages/core/src/handoff/run-handoff.ts`, `packages/core/tests/handoff/run-handoff.test.ts`
- action: after write + stamp, load config (best-effort), list `SESSION-*.md`, call `selectPrunable`, `unlink` results, populate `HandoffResult.pruned`. Wrap prune in try/catch — never rethrow. Default `pruned: []`.
- verify: testkit integration — N docs + `retain` → oldest pruned, `lastHandoff` survives; unset → none pruned; injected unlink failure → handoff still succeeds.
- done: AC-3, AC-4

### T4: report pruned docs
- files: `packages/core/src/services/handoff.ts`, `packages/core/src/cli/commands/handoff.ts`, `packages/core/tests/services/handoff.test.ts`
- action: surface `pruned` on the service `data` and print the `handoff: pruned …` line when non-empty.
- verify: service test asserts the prune line appears only when docs were pruned.
- done: AC-5

## Boundaries

- DO NOT touch the settle path, gate engine, or `resume` — pruning fires only at handoff write.
- DO NOT change `SESSION-*.md` naming or `renderSession` output.
- DO NOT add the `cadence doctor` `handoff-retention` check (that is Phase 89) or a manual `cadence handoff prune` command (out of scope / YAGNI).
- DO NOT change the default behavior for users without `handoff.retain` set — unset must remain no-pruning.
