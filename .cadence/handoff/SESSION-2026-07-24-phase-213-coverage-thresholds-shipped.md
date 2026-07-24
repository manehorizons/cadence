---
cadence_handoff: 1
generated_at: 2026-07-24T04:21:47.122Z
label: phase-213-coverage-thresholds-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 00d9539
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-24 (phase-213-coverage-thresholds-shipped)

## TL;DR for the next session
- Ran `rec-20260712-014` ("Add test-coverage reporting with enforced minimum thresholds to CI") end-to-end as **phase 213**: promote → milestone propose/accept/export → SPEC → DRAFT → 3-task subagent-driven BUILD (T1 measure+add-provider → T2 wire thresholds → T3 prove-the-gate-fails) → whole-branch review (clean) → settle.
- `vitest.shared.ts` now enables real v8 coverage and enforces per-package thresholds (keyed by `path.basename(process.cwd())`, since each package's `vitest run` executes independently); the previously-dead `coverage` block in root `vitest.config.ts` was removed. Enforcement was proven live (an intentional regression failed the gate with vitest's real threshold error, then was cleanly reverted), not just asserted.
- Landed as **PR #291** (feature, merged, all 12 checks green on 3 OS × 2 Node + CodeQL/security) + **PR #292** (shipped-promotion follow-up, merged, all green) — same two-PR pattern as phase 212.
- Found and filed a real CLI bug mid-session as **rec-20260724-001**: `cadence build task <id>` / `cadence done <id>` silently accepts a malformed id (e.g. `213-01-T1` instead of the real bare `T1`) and writes an orphaned key into `PROGRESS.json` instead of refusing — violates this repo's own "refuse + suggest, never silently mutate" convention. Caught only by re-checking `cadence status` immediately after recording; not merged/landed this session, just filed.
- Loop is IDLE, nothing in flight. Local cleanup done: phase-213 worktree + its local branch removed, both landing branches deleted (remote via `--delete-branch`, one local branch auto-cleaned by the merge).
- Next candidate: `cadence recommend`'s ranked list ties several items at score 53 (raw-idea) — see CADENCE context above; pick one and go. `rec-20260724-001` (the CLI bug just filed) is not yet ranked/scored since it was added this session — run `cadence recommend` fresh to see it factored in.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 2 ahead / 0 behind origin
- HEAD `00d9539`
- Recent commits:
```
00d9539 chore(cadence): stamp session handoff — 2026-07-24
181617d chore(cadence): stamp session handoff — 2026-07-24
5451109 chore(cadence): mark rec-20260712-014 shipped (PR #291 / phase 213) (#292)
714f3aa feat: enforce minimum test-coverage thresholds in CI (phase 213) (rec-20260712-014) (#291)
741a933 chore(cadence): mark rec-20260712-003 shipped (PR #289 / phase 212) (#290)
2d8d5f8 feat: retro friction feeds back into Praxis recommendation scoring (phase 212) (rec-20260712-003) (#289)
9c35475 chore(cadence): mark rec-20260723-003 shipped (PR #287 / phase 211); reconcile rec-20260710-001 (#288)
81b44fe fix: CLAUDECODE-aware messaging for anthropic provider in doctor + activate (phase 211) (rec-20260723-003) (#287)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260712-009 — Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY (candidate/raw-idea)
  - rec-20260718-003 — Frame dispatched task boundaries as stop-conditions, not file-scope lists (candidate/raw-idea)
  - rec-20260718-004 — Surface files-outside-boundary anomalies per-task, not only at settle (candidate/raw-idea)
  - rec-20260718-005 — Document the invisible-background-subagent-AskUserQuestion gap in host-adapter/dispatch guidance (candidate/raw-idea)
  - rec-20260710-005 — Positioning: out-of-band host-CLI verification as MORE independent than same-session self-report (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
  - dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement
  - dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)
  - dec-20260721-003 — cadence next --json includes schemaVersion: 1
  - dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command
- Files in play:
  - `packages/core/src/services/settle.ts` — affected by rec-20260712-009 Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY
  - `packages/types/src/summary.ts` — affected by rec-20260712-009 Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY

## What landed this session
- **Phase 213** — `vitest.shared.ts`: `coverage.enabled: true`, provider `v8`, `include: ['src/**']`, per-package `thresholds` table (types 91/70/39/91, core 70/82/82/70, host-claude-code 67/85/79/67, host-codex 58/86/80/58, testkit 84/78/78/84 — statements/branches/functions/lines, each ~5 points below measured coverage) keyed by `path.basename(process.cwd())`, with a `FALLBACK_THRESHOLDS` for any unrecognized cwd. Root `vitest.config.ts`'s dead `coverage` block removed. `@vitest/coverage-v8` added as a root devDependency. No changeset (test-infra-only, no published package behavior change — same precedent as PR #280).
- Every task's "done" claim was independently re-verified in the main thread before recording (diff read + fresh, non-cached `pnpm typecheck`/`lint`/`turbo run test --force` re-run), not accepted from the subagent's self-report — per this repo's verification-honesty rule.
- `rec-20260712-014` promoted to `shipped` (ref: `PR #291 / phase 213`).
- Filed `rec-20260724-001` for the `cadence done`/`build task` silent-malformed-id bug described above.

## Carry-forward gotchas
- **`cadence done <id>` / `cadence build task <id>` does not validate `<id>` against the active draft's real task ids.** Use the bare id from `cadence status`'s TASKS table (`T1`, `T2`, `T3`, ...) — never the `<phase>-<num>-<id>` form seen in DRAFT/PROGRESS filenames, even though it looks like it should be the "fully qualified" form. A wrong id is silently accepted and written as a new orphaned key, with no error and no warning; `cadence status` afterward still shows the real tasks as PENDING. Filed as `rec-20260724-001`, not yet fixed.
- **`cadence milestone propose/accept/export` and `cadence recommendation promote` genuinely mutate the intelligence ledger (`recommendations.json`, `milestones.json`, etc.) even though `milestone` is documented as "read-narrow; never transitions the loop."** Running these on the primary checkout *before* entering a phase's worktree leaves that ledger dirt stranded there — the worktree (branched fresh from `origin/main`) never inherits it, since `cadence spec new --from-rec` converts the recommendation independently inside the worktree's own copy. This session's primary-checkout dirt from `milestone propose/accept/export` had to be discarded (`git restore`) as superseded once the worktree's own conversion + settle produced the real, further-advanced ledger state. Next time: either run these commands *inside* the worktree, or treat them as fully throwaway on the primary checkout and expect to discard them after the phase settles.
- Both post-merge syncs needed `git rebase origin/main` in the primary checkout (local `main` carried the unpushed handoff-stamp commits ahead each time) — routine given the "push only when switching machines" convention, expect it again next session. One rebase correctly no-op'd a locally-committed-then-cherry-picked commit (`1e01432`) via git's cherry-pick-equivalent detection — no manual conflict resolution needed.
- `gh pr merge --squash --delete-branch` hit the known local-checkout-failure pattern on both PR #291 and #292 (`'main' is already used by worktree...` / fast-forward-diverged on `main`) — remote merge succeeded both times regardless; verified via `gh pr view <n> --json state,mergedAt,mergeCommit` each time, matching `gh-pr-merge-local-checkout-failure` in memory.
- The phase-171 sibling worktree (`.claude/worktrees/171-installer-settings-parse-failure-recovery`, stale since 2026-07-11) is still untouched — noted again, still may be worth a housekeeping pass someday.

## Next action
**Action:** Run `cadence recommend` for a fresh ranked list (it will now include `rec-20260724-001`, the CLI id-validation bug) and pick the next candidate — nothing specific is queued.
**Verify:** `rec-20260712-014` should show as `shipped`, not in the ranked/candidate list.
**If it fails:** if the ranked list looks stale or wrong, run `cadence doctor` first to check ledger integrity before investigating further.
