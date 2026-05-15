---
phase: 23-draft-read-gate
id: 23-01
tier: standard
status: APPROVED
---

# 23-01 — DRAFT-read mtime gate

## Objective

DESIGN.md §4.1 lists `draft-read` as a cheap gate; §4.2 places it in every strict cell plus `standard × standard` and `standard × complex`. Today nothing reads the DRAFT.md or records when it was last read. Wire the gate: `cadence draft approve` records `state.draftReadAt: ISO8601`; `cadence settle run` refuses if the DRAFT.md mtime is newer than `draftReadAt` (the human edited the DRAFT after approving but before settling — they need to re-read it). `--allow-stale-draft` bypasses per-invocation. First v0.4.0 phase.

## Acceptance Criteria

### AC-1: `state.draftReadAt` field on `CadenceStateZ`
Given the types package
When `CadenceStateZ.parse(...)` runs on a state.json that omits the field
Then it parses cleanly with `draftReadAt` defaulting to `null` (optional + nullable). When present, the field must be ISO8601 offset-aware (`z.string().datetime({ offset: true }).nullable()`). `emptyState()` returns `draftReadAt: null`. Backwards-compatible: existing state.json files without the field still parse.

### AC-2: `draft approve` writes `draftReadAt` on success
Given a user runs `cadence draft approve <phase> <num>` and approval succeeds (coherence + softCap checks pass)
When state.json is rewritten
Then `state.draftReadAt` is set to `new Date().toISOString()`. Failed approves (coherence blocker, softCap refusal, file-not-found) do NOT write the field. Re-approving the same draft updates the timestamp.

### AC-3: `settle run` refuses on stale DRAFT (mtime > draftReadAt)
Given `state.draftReadAt` is set and `'draft-read' ∈ gateSet.gates`
When `cadence settle run` is invoked and the DRAFT.md file's mtime is **strictly greater than** `Date.parse(state.draftReadAt)`
Then settle refuses with exit 1, prints `settle run refused: DRAFT.md was edited after approve (mtime <iso> > draftReadAt <iso>). Re-read it then re-approve, or pass --allow-stale-draft to override.` to stderr, and writes no SUMMARY. Loop position remains BUILD. The check runs before coverage / interactive / deep gates.

### AC-4: `--allow-stale-draft` bypasses + logs INFO trace
Given the same stale-DRAFT condition
When `cadence settle run --allow-stale-draft` is invoked
Then the gate is skipped; settle proceeds through the rest of the chain. One stderr line is emitted: `settle: --allow-stale-draft set; proceeding past draft-read gate (DRAFT.md mtime newer than draftReadAt).` matching the established `--allow-auto-complex` pattern.

### AC-5: Gate-aware and backwards-compatible
Given `'draft-read' ∉ gateSet.gates` (e.g., auto profile, or quick-fix tier where the gate isn't enabled per §4.2)
When settle runs
Then no mtime check fires regardless of DRAFT.md mtime. Also: when `state.draftReadAt` is `null` (pre-23.1 state.json or first run before any approve), the gate also silently passes — there's no "baseline" to compare against. Both conditions tested explicitly.

### AC-6: full suite + docs + dogfood
Given Phase 23.1 lands
When `pnpm turbo run test` runs
Then ~396 → ~404 tests pass (5-8 new). DESIGN.md §4.1 cheap-gate row notes `draft-read` shipped Phase 23.1; §10 punchlist gains `Phase 23.1 — draft-read mtime gate`. AC-1..AC-6 each referenced by ≥1 test file. Self-dogfood: settle this phase under `--auto --allow-missing-coverage` — auto profile excludes `draft-read` from the gate set (per §4.2 matrix), so the gate doesn't fire and no cap-bypass needed.

## Tasks

### T1: Add `draftReadAt` field to `CadenceStateZ`
- files: `packages/types/src/state.ts`, `packages/types/tests/state.test.ts`
- action: Add `draftReadAt: z.string().datetime({ offset: true }).nullable()` to `CadenceStateZ`. **Make it optional at the parse layer** (use `.default(null)`) so legacy state.json files without the field still parse cleanly — that's AC-1 backwards-compat. Update `emptyState()` to return `draftReadAt: null`. Update the type export. Add tests: (a) emptyState includes the field; (b) state.json without the field parses + defaults to null; (c) malformed ISO8601 rejected; (d) valid ISO8601 round-trips.
- verify: `pnpm -C packages/types test` green; new test count up by ~4.
- done: AC-1

### T2: `draft approve` records `draftReadAt` on success
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-approve.test.ts`
- action: In the `approve` action, after all gates pass (coherence, softCap) and immediately before `await backend.writeState(state)`, set `state.draftReadAt = new Date().toISOString()`. Update `renderStateMd` only if it currently surfaces the field (probably doesn't — leave that to a follow-up if needed). Add tests: (a) successful approve writes `draftReadAt` to a parseable ISO8601 string; (b) approve refused on coherence blocker leaves the field at its prior value (null on first run); (c) approve refused on softCap also leaves the field unchanged; (d) re-approving the same phase/draft updates the timestamp.
- verify: vitest green; new assertions added.
- done: AC-2

### T3: `settle run` refuses on stale DRAFT + `--allow-stale-draft` bypass
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/draft-read-gate.test.ts` (new)
- action: After `gateSet` is computed and the softCap check has passed, add a new gate block: `if (gateSet.gates.includes('draft-read') && state.draftReadAt) { stat the DRAFT.md path, compare mtime to Date.parse(state.draftReadAt); if mtime > draftReadAt && !opts.allowStaleDraft → refuse per AC-3 } else if (...&& opts.allowStaleDraft) → log INFO per AC-4`. Add the `--allow-stale-draft` commander option + the `allowStaleDraft?: boolean` slot in the action handler signature. New test file `tests/cli/draft-read-gate.test.ts`: (a) stale DRAFT refused (touch the file post-approve via `utimes`); (b) bypass with `--allow-stale-draft`; (c) DRAFT not modified ⇒ no refusal; (d) `draftReadAt: null` ⇒ no refusal regardless of mtime; (e) gate not in gate set (auto profile fixture) ⇒ no refusal; (f) refusal does not write SUMMARY or transition state.
- verify: vitest green; spawned-CLI integration tests via `tempRepo`.
- done: AC-3, AC-4, AC-5

### T4: docs + dogfood
- files: `DESIGN.md`
- action: DESIGN.md §4.1 cheap-gate row — append `**`draft-read` shipped Phase 23.1.**` notation, matching prior shipped-gate annotations. §10 punchlist gains a top-level `Phase 23.1 — draft-read mtime gate ✓` entry. Verify AC-1..AC-6 each carry an `AC-N` reference in at least one test file (T1 covers AC-1 in `state.test.ts`; T2 covers AC-2 in `draft-approve.test.ts`; T3 covers AC-3/4/5 in `draft-read-gate.test.ts`; AC-6 is meta — referenced in this task header). Self-dogfood: 23.1's draft tier is `standard`, profile defaults to `auto` ⇒ `draft-read` NOT in the gate set per §4.2 matrix (auto × standard cell has only `test-coverage` + `anomaly-notify`). So the new gate does not fire on its own settle. Confirm with `cadence settle run --auto --allow-missing-coverage`.
- verify: visual read; full suite green; settle 23.1 succeeds without the new flag.
- done: AC-6

## Boundaries

- DO NOT change the DRAFT.md content shape or parser. The mtime comparison reads filesystem stat only.
- DO NOT default `draftReadAt` to anything other than `null` in `emptyState`. Setting it to "now" on init would make the first approve a no-op (mtime <= draftReadAt always) and mask real edits.
- DO NOT bump `state.json` schemaVersion. Adding an optional nullable field is a backwards-compatible additive change.
- DO NOT compare the *current* DRAFT.md mtime to the *commit* time. mtime vs `draftReadAt` is the contract — the human's filesystem is the source of truth.
- DO NOT cache the mtime in state.json. Each settle stats the file fresh. State.json holds only `draftReadAt` (when the approve happened).
- DO NOT extend the gate to other files (e.g., PROGRESS.json, PROJECT.md). Only DRAFT.md.
- DO NOT add a `cadence draft refresh-read` command in this phase. If users hit the refusal a lot, that's a follow-up phase. Today: re-approve is the only way to refresh `draftReadAt`.
- DO NOT change the order of existing gate checks. New check slots in after softCap, before coverage.
