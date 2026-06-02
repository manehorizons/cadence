---
phase: 41-backend-commit
id: 41-01
tier: standard
status: DONE
---

# 41-01 — Backend `commit(state)` seam

## Objective

(Architecture review candidate #3.) The `StateBackend` interface (`state/backend.ts`) is too narrow: ~13 `renderStateMd` references across ~7 files (`cli/commands/{settle,draft,init,spec}.ts`, `hooks/handlers.ts`, `build/record.ts`) pair `backend.writeState(state)` with a manual `renderStateMd(state)` + `atomicWriteText(STATE.md, …)`. Forgetting the second step leaves `STATE.md` stale. Add `backend.commit(state)` that writes both artefacts; demote `writeState` to package-internal. Operator-approved behavior change — kills the stale-STATE.md class.

## Acceptance Criteria

### AC-1: commit writes both artefacts together
Given the new `commit(state)` on `SimpleStateBackend`
When it is called
Then `commit(state)` writes `state.json` and `STATE.md` together (validated, atomic), with STATE.md content = `renderStateMd(state)`

### AC-2: renderStateMd confined to state/
Given the call-site conversions
When the tree is scanned
Then no caller outside `state/` imports `renderStateMd` directly — only `state/simple.ts` (inside `state/`) imports it

### AC-3: writeState removed from the public interface
Given the `StateBackend` interface
When the seam lands
Then `writeState` is no longer in the public `StateBackend` interface — it is `private` on `SimpleStateBackend`

### AC-4: a new artefact is one method change
Given a hypothetical new state-derived artefact
When it is added
Then it can be added by changing one method (`commit`), since `commit` is the single composition point for derived writes

### AC-5: stale-STATE.md class eliminated
Given the four previously state-only sites (`build/record.ts`, `handlers.handleSubagentResult` / `handleSkillInvoke` / `handlePostToolEdit`)
When they run after conversion
Then no two-step path remains for any caller to omit, STATE.md is never stale (build task + subagent/skill hooks now refresh it), and no test depended on the old stale behavior

## Tasks

### T1: simple.ts commit + commit.test.ts (TDD red→green)
- files: `packages/core/src/state/simple.ts`, `packages/core/tests/state/commit.test.ts`
- action: add `commit(state)` = private `writeState` (state.json, validated, atomic) + `atomicWriteText(STATE.md, renderStateMd(state))`; make `writeState` private; import `atomicWriteText` + `renderStateMd`; test both artefacts written, STATE.md content matches `renderStateMd`, both land atomically
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run state/commit`
- done: AC-1, AC-4

### T2: backend.ts interface +commit -writeState
- files: `packages/core/src/state/backend.ts`, `packages/core/tests/state/simple.test.ts`
- action: add `commit(state): Promise<void>` to the `StateBackend` interface and remove `writeState` from it; fix the lone `writeState` round-trip in `simple.test.ts` to `commit`
- verify: `pnpm -C packages/core build && pnpm -C packages/core test -- run state/simple`
- done: AC-3

### T3: convert the seven call-site files to commit()
- files: `packages/core/src/cli/commands/{settle,draft,draft-new,spec,init}.ts`, `packages/core/src/hooks/handlers.ts`, `packages/core/src/build/record.ts`
- action: drop the `renderStateMd` + STATE.md `atomicWriteText` lines at the two-step sites and swap `writeState` → `commit`; convert the three state-only hooks + `build/record.ts` to `commit` (now refresh STATE.md); route `init` through `new SimpleStateBackend(cwd).commit(state)`; drop now-unused `renderStateMd` / `atomicWriteText` imports
- verify: `pnpm -C packages/core test -- run cli/settle cli/draft cli/spec build/record hooks state`
- done: AC-2, AC-5

### T4: full gate
- files: (none — verification)
- action: run the full `pnpm turbo run lint typecheck test build` gate; the build-task and hook suites are the proof for the STATE.md-freshness change; all other suites stay green unchanged; verify no `renderStateMd` import outside `state/`
- verify: full gate green
- done: AC-2, AC-5

## Boundaries

- DO NOT inline `writeState` into `commit` — keep it as a private primitive so the validated atomic `state.json` write has one home.
- DO NOT leave any caller able to reach `writeState` directly (interface removal + private modifier).
- DO NOT import `renderStateMd` from any file outside `state/` after conversion.
- DO NOT add a bespoke write path in `init` — route through a throwaway `SimpleStateBackend` so bootstrap can't drift from the one write path.
- DO NOT change STATE.md content semantics — the per-edit STATE.md write is identical bytes (touchedFiles isn't rendered).
