---
cadence_handoff: 1
generated_at: 2026-08-01T02:42:15.120Z
label: kernel-arc-merge-decision-review-recs-filed
loop_position: IDLE
active_phase: 243-untitled
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: e6a2d1d6
git_ahead: 2
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-01 (kernel-arc-merge-decision-review-recs-filed)

## TL;DR for the next session
- Started from "is the phase-243 verification-loudness fix resolved" and ended up discovering the *deeper* provenance fix (rec-20260727-001, "closes Cadence's sole surviving P0") is already substantially built as phases 232-236/241/242 on the long-lived `feat/kernel-assurance-v2` branch — unmerged to `main`.
- Empirically tested (real scratch-worktree merges, not just diff-stat) both a cherry-pick-just-the-P0-fix path and a merge-the-whole-arc path. Whole-branch merge is clean end-to-end (lint/typecheck/build/test all green); cherry-pick is clean in isolation but creates real duplicate-lineage conflicts when the rest of the arc eventually merges back.
- Operator correctly pushed back: no phase in the arc has ever settled under a real (non-mock) verifier identity — confirmed by inspecting the arc's own SUMMARY.json files. Green tests ≠ independently reviewed. Dispatched two independent fresh-context review agents against the full arc diff instead of self-reviewing.
- Both agents' top findings were spot-verified directly against source (not taken on faith) and are real: 2 HIGH (finding-identity's content hash is mock-stable only; also unstable across the DRAFT-amendment/anchor-earning workflow AC-5 itself showcases — both defeat phase 242's ledger dedup), 2 MEDIUM, 2 LOW. Filed as rec-20260801-002 through -007.
- Fixed two stale-doc gaps (design doc §12 status labels, ROADMAP.md phase 234/236 headers) and opened **PR #347** against `feat/kernel-assurance-v2` carrying both the doc fixes and the 6 new recs — **not merged**.
- **The merge decision itself (cherry-pick / merge-whole-branch / hold) is still unresolved** — that's the next action, now informed by the review.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 2 ahead / 0 behind origin
- HEAD `e6a2d1d6`
- Recent commits:
```
e6a2d1d6 chore(cadence): stamp session handoff — kernel-arc-phase242-merged-pr346
fef5b224 chore(cadence): stamp session handoff — phase243-mock-banner-shipped-recs-filed
90887434 chore(cadence): session handoff stamp + CLAUDE.md model-selection docs (#345)
db225ace fix: loud banner on every seam's credential-missing downgrade (phase 243) (#344)
c29bd4ec chore(cadence): session handoff -- v1.52.0 released, rec-20260731-001 filed (#343)
c56532d9 chore(cadence): file rec-20260731-001 (release-currency doctor check) (#342)
9da0ab58 chore(release): v1.52.0 -- Node >=22 engine floor, phase-qualified AC coverage, doctor multi-seam readiness (#341)
424bd403 chore(cadence): session handoff doc sweep — phases 232-236, 238-239, 241 (#339)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMENDATIONS.md   |  2 ++
 .cadence/intelligence/evidence.json        | 14 ++++++++++++++
 .cadence/intelligence/recommendations.json | 16 +++++++++-------
 .claude/scheduled_tasks.lock               |  1 -
 4 files changed, 25 insertions(+), 8 deletions(-)
```
- Loop: IDLE · phase 243-untitled · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit (candidate/ready-for-cadence-spec)
  - rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome (candidate/ready-for-cadence-spec)
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports (candidate/ready-for-cadence-spec)
  - rec-20260731-001 — cadence doctor: release-currency check (local package.json vs published npm) (candidate/ready-for-milestone)
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
  - dec-20260726-001 — Split SUMMARY.json attestation: content-hash now, full signing deferred to threat model
  - dec-20260730-001 — Coverage phase-scoping uses a phase-qualified test token, not file-ownership scoping
- Files in play:
  - `packages/core/src/gates/types.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/types/src/summary.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/core/src/cli/commands/summary.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/gates/engine.ts` — affected by rec-20260727-003 Kernel/verifier contract + lint rule against internal imports
  - `packages/core/src/doctor/run.ts` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)
  - `.githooks/pre-push` — affected by rec-20260731-001 cadence doctor: release-currency check (local package.json vs published npm)

## What landed this session
- Diagnosed that "the verification bug" the user asked about at session start splits into two: phase 243's loud-banner fix (merged to `main` via PR #344, unreleased) and the deeper provenance-recording gap (rec-20260727-001), which was NOT on `main` but substantially already built on `feat/kernel-assurance-v2`.
- Verified (real `git merge`/`cherry-pick` dry runs in disposable scratch worktrees, `pnpm turbo run lint typecheck test build` on the results, not just diff stats) that merging the whole arc branch into `main` is clean; cherry-picking just Slice 1 (phases 232+233) creates real future conflicts in `code-review.ts`/`registry.ts`/`settle.ts`/2 test files when the rest of the arc eventually merges back.
- Found a live concurrent session in `.claude/worktrees/kernel-ledger-routing` mid-merge of PR #346 (phase 242, findings-to-ledger auto-routing) into `feat/kernel-assurance-v2` — waited for it to finish and tear down before touching that branch further.
- Confirmed via the arc's own `SUMMARY.json` files (phases 235/236/241/242) that none have ever settled under a real (non-mock) verifier identity — phase 241 explicitly shows `provider: mock`.
- Discovered a **second** live session in `.claude/worktrees/kernel-arc-work` (branch `kernel-arc-work`, tracking `feat/kernel-assurance-v2`), actively drafting phase 244 as of ~20:49 on 2026-07-31 — confirmed still running as of this handoff. Created an isolated worktree (`.claude/worktrees/kernel-arc-docs-review`, new branch `docs/kernel-arc-status-refresh` off `origin/feat/kernel-assurance-v2`) to avoid any conflict with it.
- Fixed the design doc's (`docs/handoffs/cadence-phase0-assurance-kernel-review.md`) stale §12 status labels and 3 stale ROADMAP.md phase headers (234/235/236 still said "sketch — contingent" despite being built; 236's header contradicted its own body).
- Dispatched two independent fresh-context agents (read-only git commands only) to adversarially review the full arc diff vs `main`; personally re-verified their two most severe findings directly against source before trusting them.
- Filed 6 recommendations (rec-20260801-002 through -007) from the review findings; committed + pushed alongside the doc fixes.
- Opened and updated **PR #347** (`docs/kernel-arc-status-refresh` → `feat/kernel-assurance-v2`) — not merged.
- Added two evidence notes on `main` (uncommitted) to rec-20260731-003 and rec-20260727-001 documenting the cherry-pick-safety and merge-back-cost findings.

## Carry-forward gotchas
- **Do not touch `.claude/worktrees/kernel-arc-work`.** Another session's worktree (branch `kernel-arc-work`, tracking `origin/feat/kernel-assurance-v2`), was actively drafting `.cadence/phases/244-settle-time-guard-for-global-cli-shadowing-branch-build/` as of 2026-07-31 20:49, with a live `claude` process confirmed still running at handoff time. Confirm it's actually finished (per CLAUDE.md's Zombie Session rule) before touching that branch again — don't assume dead without checking (`ps -p <pid>`, worktree dir still exists, uncommitted ledger diff still present).
- My own worktree `.claude/worktrees/kernel-arc-docs-review` (branch `docs/kernel-arc-status-refresh`) holds PR #347 — safe to remove once the PR merges or is abandoned, not before.
- `gh pr edit --title/--body` fails on a known `gh` GraphQL bug in this repo (deprecated Projects-Classic query) — use `gh api repos/manehorizons/cadence/pulls/<n> -X PATCH -f title=... -f body=...` instead. Reconfirmed this session for edit, not just for `--base` as previously noted.
- **rec-id collision, not yet reconciled**: `main`'s `rec-20260731-003` (gate provenance / this session's original investigation target) and the arc branch's `rec-20260731-003` (phase 242, findings-to-ledger auto-routing, already merged into `feat/kernel-assurance-v2` via PR #346) are two different recs sharing one id. Will conflict the moment these ledgers merge — diff-and-reconcile (keep both under distinct ids), same pattern as the 2026-07-24 collision. Don't blanket-copy either ledger over the other.
- The 6 newly-filed recs (rec-20260801-002 through -007) live only on `feat/kernel-assurance-v2` (via PR #347), not on `main` — they won't show up in `main`'s `cadence recommendation list` until that PR (or the whole arc) merges.
- Two of the six findings (rec-20260801-002, -003, both `high`) are real correctness gaps in the exact mechanism under discussion for merging — surfaced only because an independent review was run instead of trusting green tests. Don't let "tests pass" stand in for "reviewed" again on this arc.
- Uncommitted on `main` (this checkout) at handoff: `ev-20260801-001` (on rec-20260731-003) and `ev-20260801-002` (on rec-20260727-001), documenting the cherry-pick-safety and merge-back-cost findings from earlier in the session. Left uncommitted deliberately — bundle into the small chore commit the next action calls for, don't commit alone with no message context.
- The scratch-worktree safety-testing procedure used repeatedly this session (branch off `main`/`origin/<ref>` into `/tmp/.../scratchpad/<name>`, cherry-pick or merge, resolve conflicts, `pnpm install && pnpm turbo run lint typecheck test build`, then `git worktree remove --force` + `git branch -D`) is a reusable pattern for any future "is this safe to merge" question — cheap, real evidence, always cleaned up after.

## Next action
**Action:** Confirm `.claude/worktrees/kernel-arc-work`'s session has actually finished (see gotcha above), then decide the kernel-arc merge path with the operator, now informed by the review: scope fixes for rec-20260801-002/-003 (the two `high` findings — finding-identity id-stability under real providers and across the DRAFT-amendment workflow) before merging, since they land on the arc's core promise and would otherwise ship into `main` unaddressed. Once fixed (or if the operator explicitly accepts the risk and wants to proceed anyway), re-run the whole-branch-merge safety test one more time (the scratch-worktree procedure above) since the arc branch keeps moving — phase 244 landed after this session's tests were run. Reconcile the `rec-20260731-003` id collision as part of that merge. Separately, commit the two uncommitted evidence-note changes on `main` as a small chore commit.
**Verify:** `pnpm turbo run lint typecheck test build` green on the final merge candidate; `cadence recommendation list` shows no duplicate/colliding ids; `cadence resume --list` no longer shows a live session in `kernel-arc-work`.
**If it fails:** if the `high` findings turn out more invasive to fix than expected, ask the operator whether to merge anyway with them tracked as known-issues versus holding — don't decide unilaterally which risk to accept.
