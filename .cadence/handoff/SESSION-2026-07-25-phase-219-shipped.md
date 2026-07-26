---
cadence_handoff: 1
generated_at: 2026-07-25T14:01:41.990Z
label: phase-219-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: d303dfd2
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-25 (phase-219-shipped)

## TL;DR for the next session
- **Phase 219 (rec-20260724-013) is shipped**: `nextRecommendationId` now cross-checks `evidence.json` so a dangling evidence row can never collide with a freshly minted recommendation id; a new `cadence doctor` `orphaned-evidence` check surfaces this class of drift going forward. PR #302 merged (all 13 CI checks green, whole-branch review clean), rec promoted to `shipped`, `docs/reference/commands.md`'s doctor-check table updated in the same commit.
- Full pipeline run this session: recommend → promote → milestone propose/accept/export → SPEC → DRAFT (TDD-shaped, 4 tasks) → BUILD (wave-based subagent dispatch, every DONE independently re-verified in the main thread, not trusted from subagent reports) → whole-branch review → single-commit settle → PR → land.
- Loop is IDLE, nothing in flight. `main` is 2 ahead / 0 behind origin — the two pre-existing handoff-stamp commits from the prior session, intentionally left unpushed (push only when switching machines).
- Post-merge, the primary checkout needed a rebase of those 2 unpushed commits onto the new `origin/main` tip; this produced one expected ledger conflict (pre-worktree "accepted" snapshot of rec-013 vs. the merged commit's already-"shipped"/archived version) — resolved by keeping the merged/upstream state. No data lost, verified via `git log`/JSON-validity/`grep` for leftover conflict markers.
- No blockers. Next session should run `cadence recommend` fresh (already run this session — see below) and pick from the `needs-decision`/`needs-evidence` candidates, or ask the operator to resolve one of the `needs-decision` gray-area items.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 2 ahead / 0 behind origin
- HEAD `d303dfd2`
- Recent commits:
```
d303dfd2 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 and flake fix shipped)
25c75be6 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 shipped)
e05922e8 fix: cross-check evidence.json in recommendation id-minting (phase 219-recommendation-id-cross-check) (rec-20260724-013) (#302)
7a72d830 fix(release): give post-publish npm verification a patient retry budget (phase 218-release-verify-retry-budget) (rec-20260725-001) (#301)
d7dedf12 chore(release): v1.51.0 -- SETTLE trust-envelope gate, evidence-floor gate, CHANGELOG-currency gate, retro friction scoring (#300)
87b37a15 feat(githooks): extend the doc-sync gate to CHANGELOG.md (phase 217-changelog-currency-gate) (rec-20260724-003) (#299)
3d1f9b52 chore(security): document brace-expansion audit exception + fix orphaned ledger entry (#298)
d80ce817 docs: sync stale GitHub Pages demo + back-fill CHANGELOG.md through v1.50.0 (#297)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md   | 11 ++-------
 .cadence/intelligence/recommend.json | 47 +++---------------------------------
 2 files changed, 5 insertions(+), 53 deletions(-)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260724-006 — Signed or tamper-evident SUMMARY attestations (candidate/needs-decision)
  - rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state (candidate/needs-evidence)
  - rec-20260724-012 — pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented (candidate/needs-evidence)
  - rec-20260712-009 — Record a gate lifecycle-state taxonomy (requested/started/passed/refused/failed/timed-out) in SUMMARY (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
  - dec-20260721-001 — cadence next extends nextAction(), does not subsume quickstart or reimplement
  - dec-20260721-002 — Shared legal-moves computation also powers empty-state footers (rec-20260721-001)
  - dec-20260721-003 — cadence next --json includes schemaVersion: 1
  - dec-20260721-004 — Ship /cadence-next slash command alongside the CLI command
  - dec-20260724-001 — Enforce ledger-diff at audit close, not a standing rule
  - dec-20260724-002 — Scope rec-20260724-003 to a CHANGELOG-currency gate only, defer auto-generation
- Files in play:
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/types/src/summary.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `packages/core/src/services/settle.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `docs/team-rollout.md` — affected by rec-20260724-007 Define and document multi-contributor concurrency semantics for .cadence state
  - `package.json` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented
  - `pnpm-workspace.yaml` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented

## What landed this session
- Resumed cleanly via `/resume` (no drift, origin freshness verified, one stale unrelated worktree — `.claude/worktrees/171-installer-settings-parse-failure-recovery` — flagged but left alone).
- Independently verified rec-20260724-013's root cause by reading `packages/core/src/intelligence/store/ids.ts` and `recommendations.ts` before promoting it past `needs-evidence`.
- Ran the recommendation through the full milestone pipeline: `cadence recommendation promote` → `cadence milestone propose/accept/export` → `cadence spec new --from-rec` → `cadence draft new` (hand-edited SPEC/DRAFT bodies to match the two real ACs, since the generic bugfix template only covered one).
- Bootstrapped a fresh worktree's `state.json` via `cadence onboard` (a brand-new `EnterWorktree` checkout has `.cadence/` from git but no `state.json` — `cadence init` refuses since `.cadence/` already exists; `onboard` is the phase-196-documented bootstrap path for exactly this).
- Built via wave-based subagent dispatch (T1+T3 parallel, then T2, then T4), each DONE recorded only after independently re-running the actual verify commands in the main thread and reading the real diff — not from the subagent's own report.
- Whole-branch review caught one real (non-blocking) gap — the doctor-check doc table was missing a row for the new check — fixed before commit.
- Single-commit settle, changeset added, rec promoted to `shipped`, PR #302 opened, watched to green, merged (squash) after explicit operator consent.
- Hit the known `gh pr merge --delete-branch` local-checkout-failure pattern again (main already checked out elsewhere) — remote merge succeeded regardless; deleted the remote branch by hand afterward.
- Removed the phase worktree (with operator confirmation, since its one commit was already squash-merged into main) and synced the primary checkout.

## Carry-forward gotchas
- **A brand-new worktree created via `EnterWorktree` has `.cadence/` (git-tracked) but NO `state.json`** (gitignored since phase 196) — any state-mutating `cadence` command refuses with "CADENCE not initialized here", and `cadence init` ALSO refuses because `.cadence/` already exists. The fix is `cadence onboard`, which detects exactly this case and bootstraps a fresh IDLE `state.json` — do this first, before `spec new`/`draft new`, in every fresh worktree.
- **A fresh worktree also needs its own `pnpm install` + `pnpm build`** (or at minimum `pnpm --filter @manehorizons/cadence-core build`, but that alone fails — `cadence-types` must build first, so use root `pnpm build` via turbo) before `node packages/core/bin/cadence.cjs` will run — it's a separate working directory with no `node_modules`/`dist`.
- **The global `cadence` on PATH was 1.49.0 while the repo is at 1.51.0** (again — see existing memory on this). Always use `node packages/core/bin/cadence.cjs` inside a worktree for any dogfooded/new-gate logic.
- **Rebasing unpushed local commits onto a freshly-merged PR's new `origin/main` tip can produce a ledger conflict** if the primary checkout has stale pre-worktree "in-flight" state (e.g. a rec still showing `accepted` from before the phase work, when the merged commit already shows it `shipped`/archived). Resolve by taking the upstream/merged side — it reflects the true final state; the stashed snapshot is just outdated.
- `.cadence/intelligence/RECOMMEND.md`/`recommend.json`/`MILESTONES.md`/`milestones.json` are gitignored-but-previously-tracked ephemeral files (like `state.json`) — they'll keep showing as locally modified. Leave them alone; don't commit, don't `git restore` them mid-anything.
- `gh pr merge --squash --delete-branch` hit the familiar local-checkout-failure pattern again (`'main' is already used by worktree`) when run from inside the phase worktree while the primary checkout sat on `main`. The remote merge always completes anyway — verify with `gh pr view --json state,mergedAt,mergeCommit`, then `git push origin --delete <branch>` by hand if `--delete-branch` didn't get to run.
- `cadence recommend`'s very first invocation in a session occasionally returns a stale-looking ranking (missing recent-day recs) before a second/third call returns the correct fresh set — seen again this session (33/10 totals, then 43/20 on retry). Harmless so far (re-running fixes it), but worth a `cadence recommend --json`-vs-`recommend.json`-mtime look if it recurs a third time — smells like a stale on-disk cache being served once before a live recompute.

## Next action
**Action:** Run `cadence recommend` to pick the next unit of work — nothing pre-selected. `rec-20260724-012` (pnpm.overrides dead-on-arrival) is the one remaining `needs-evidence` candidate that doesn't require an operator decision first; `rec-20260724-004`/`-006`/`-007` are `needs-decision` gray-area items — surface them to the operator rather than guessing.
**Verify:** `cadence progress` should show `IDLE` with no active phase/draft before starting anything new; `gh pr view 302 --json state,mergedAt` should show `MERGED` if you want to reconfirm this session's work actually landed.
**If it fails:** if `cadence recommend` surfaces nothing actionable, check the "Top recommendations" list above (pre-filled from this handoff's generation) for one already `ready-for-milestone`, or ask the operator which gray-area rec to resolve first.
