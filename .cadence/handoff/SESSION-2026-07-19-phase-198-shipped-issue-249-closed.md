---
cadence_handoff: 1
generated_at: 2026-07-19T15:25:12.378Z
label: phase-198-shipped-issue-249-closed
loop_position: BUILD
active_phase: 198-bound-filter-regex-complexity-to-prevent-redos
active_draft: 198-01
tier: standard
git_branch: main
git_dirty: true
git_head: 4615343
git_ahead: 5
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-19 (phase-198-shipped-issue-249-closed)

## TL;DR for the next session
- Shipped phase 198: closed issue #249 (CodeQL ReDoS-shaped regex-injection) by capping `--filter-regex` to 200 characters in `assumption`/`decision`/`recommendation list`, rejected before `new RegExp(...)` ever compiles it. PR #252 merged, all 14 CI checks green (incl. CodeQL itself), landed via the `pr-land` skill.
- Session resumed the phase-197 handoff, authored the DRAFT interactively with the operator (three explicit calls: length-cap only — no catastrophic-backtracking heuristic; duplicate the validator per file, matching the existing `parseRegexFlags` precedent, no shared helper; tier `standard`), then ran the full `phase-build` pipeline: 4 tasks, each independently implemented → adversarially reviewed → main-thread re-verified, plus a whole-branch review that caught one real gap (`docs/reference/commands.md` not updated for the new limit) fixed before settle.
- Mid-build self-correction: `draft new`/`approve` were mistakenly run in the primary checkout *before* creating the worktree, so the DRAFT never carried over (uncommitted work + per-worktree `state.json` since phase 196). Recreated the exact approved DRAFT inside the worktree and discarded the orphaned copy — no work lost, but see the carry-forward gotcha below, this left local state dirty.
- Also caught and fixed a drafting gap before dispatch: T2 was missing `depends: T1`, which would have let "write failing test" and "implement fix" run in the same wave, breaking red-then-green TDD order.
- `gh pr merge --delete-branch` hit its known local-checkout failure again, and this time also silently failed to delete the remote branch — verified the merge independently via `gh pr view --json state,mergedAt,mergeCommit` and deleted the branch manually.
- No blockers. Loop is genuinely IDLE on `origin/main`; see gotcha below for why the *primary checkout's own local* `state.json` disagrees.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 5 ahead / 0 behind origin
- HEAD `4615343`
- Recent commits:
```
4615343 Merge branch 'main' of github.com:manehorizons/cadence
7a9098a fix: bound --filter-regex length to prevent ReDoS (phase 198) (#252)
a90cad3 chore(cadence): stamp session handoff — phase-197-shipped-issue-177-onboard-fallout
8cc4b2d chore(cadence): stamp session handoff — phase-196-shipped-issue-177-closed
a2f3e8b chore(cadence): stamp session handoff — phase-195-shipped-issue-206-closed
bb6259e chore(cadence): stamp session handoff — phase-194-shipped-v1.47.0-released
9dd68f8 fix: cadence onboard bootstraps missing state.json for fresh worktrees/clones (phase 197) (#250)
ac6722c fix: untrack per-worktree state.json/STATE.md to stop cross-worktree merge conflicts (issue #177) (phase 196) (#247)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md   |  33 +++++++---
 .cadence/intelligence/recommend.json | 123 +++++++++++++++++++++++++++++------
 .claude/scheduled_tasks.lock         |   1 -
 packages/core/bin/cadence.cjs        |   0
 website/.gitignore                   |   1 +
 5 files changed, 126 insertions(+), 32 deletions(-)
```
- Loop: BUILD · phase 198-bound-filter-regex-complexity-to-prevent-redos · tier standard

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable) (candidate/raw-idea)
  - rec-20260712-003 — Retro friction feeds back into Praxis recommendation scoring (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- `fix: bound --filter-regex length to prevent ReDoS (phase 198)` — closes #249. PR #252, squash-merged, `ci-success` green (14/14 checks).
- 9 new tests across `assumption.test.ts`/`decision.test.ts`/`recommendation.test.ts`: 3 regression (`AC-1`, prove the 5000-char case is now rejected), 3 boundary-adjacent parity (`AC-2`, a 199-char legitimate pattern still filters correctly), 3 exact-boundary (`AC-3`, 200 chars passes / 201 fails, identical across all three commands).
- `docs/reference/commands.md` updated (3 rows: `recommendation`/`assumption`/`decision`) to document the new 200-char `--filter-regex` limit — the automated `cli-reference.test.ts` doc-sync test does not cover subcommand filter flags, so this needed the whole-branch review + a manual fix, not a gate.
- `.changeset/bound-filter-regex-length.md` added (patch, `@manehorizons/cadence-core`).

## Carry-forward gotchas
- **Primary checkout's local `.cadence/state.json` (gitignored) is stale**: shows `loopPosition: BUILD`, `activePhase: 198-bound-filter-regex-complexity-to-prevent-redos`, `activeDraft: 198-01` — an artifact of the mid-session mistake (`draft new`/`approve` run in the primary checkout before entering the worktree; per the "Worktree DRAFT authoring order" memory, uncommitted pre-worktree work never carries into a fresh worktree, and each worktree gets its own independent `state.json`). The REAL phase 198 build happened correctly inside the worktree and is fully merged — `.cadence/phases/198-.../` now holds the real, complete `SUMMARY`/`PROGRESS`/`RETRO` artifacts from that worktree's actual settle. **Do NOT run `cadence settle run --auto` in the primary checkout to "fix" this** — it would operate on an already-closed phase and risks a conflicting/duplicate settle event. Left for the operator; the next genuine state-mutating `cadence` command in the primary checkout should move past it naturally, or `state.json` can be regenerated deliberately.
- `gh pr merge --delete-branch`'s local post-merge-checkout step failed again (5th+ session with this exact pattern — primary checkout has `main` checked out while a worktree also existed), **and this time the remote branch delete also silently no-op'd** too (same secondary failure the phase-197 handoff flagged once before). Always verify with `gh pr view <n> --json state,mergedAt,mergeCommit` and `git ls-remote --heads origin <branch>` before assuming cleanup finished; this session deleted the remote branch manually with `git push origin --delete <branch>`.
- Routine `.cadence` telemetry drift (`RECOMMEND.md`/`recommend.json` revision counters) and the recurring `packages/core/bin/cadence.cjs` file-mode flip (644↔755, zero content diff) are present again — same as every recent handoff, left for the operator.
- Primary checkout still has two untracked docs unrecognized by this or the last session: `docs/cc-insights-ingestion-handoff.md`, `docs/handoff-v147-recommendations.md` — not investigated or acted on, same as flagged last time. Also new since the last handoff and likewise not investigated: an untracked `audit-reports/` directory and `packages/core/.gitignore`.
- `main` is 5 ahead / 0 behind origin (4 pre-existing handoff-stamp commits carried from prior sessions, plus this session's own post-merge sync merge-commit) — left unpushed for the operator, same pattern as every recent handoff.
- The `cadence onboard` state.json-bootstrap fix (phase 197) still isn't on npm. Any future session working in a **fresh worktree** created before the next release hits the same gotcha phase 197's handoff described: build from source (`pnpm --filter @manehorizons/cadence-types build && pnpm --filter @manehorizons/cadence-testkit build && pnpm --filter @manehorizons/cadence-core build`) and use `node packages/core/bin/cadence.cjs`, or hand-bootstrap a temporary `state.json` if stuck on the pre-release global binary.

## Next action
**Action:** No phase is committed yet for next session — two ready options: (a) `gh issue view 248` (bug, untriaged: "cadence recommendation add can reuse an archived recommendation's ID") or `gh issue view 251` (untriaged, no labels: "Recommendation lifecycle mutations don't transactionally regenerate derived views") as a phase 199 candidate; or (b) `cadence recommend` for the existing raw-idea candidates (rec-20260619-008 team rollout kit, rec-20260709-003 `cadence init --ci`, etc. — each needs `cadence milestone propose` before it's phase-ready). Whichever is picked, run `EnterWorktree` **first**, then do all `cadence draft new`/`check`/`approve` work inside the worktree — do not repeat this session's mid-build mistake of authoring the draft in the primary checkout first.
**Verify:** `cadence progress` (run from inside the worktree) shows a new active draft once the phase is scaffolded.
**If it fails:** if working in a fresh worktree, hit the `state.json` bootstrap gotcha above — build from source or hand-bootstrap `state.json` before anything else. If `cadence draft new` collides on a phase number, re-check `cadence progress`/`cadence doctor` for the current genuinely-free number rather than trusting a stale local read.
