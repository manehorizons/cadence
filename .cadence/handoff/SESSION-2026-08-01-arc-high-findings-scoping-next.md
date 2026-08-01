---
cadence_handoff: 1
generated_at: 2026-08-01T15:45:03.917Z
label: arc-high-findings-scoping-next
loop_position: IDLE
active_phase: 243-untitled
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 033586a6
git_ahead: 4
git_behind: 1
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-01 (arc-high-findings-scoping-next)

## TL;DR for the next session
- Resumed from the prior session's unresolved kernel-arc merge decision (cherry-pick / merge-whole / hold `feat/kernel-assurance-v2` into `main`), still blocked on 2 HIGH correctness findings from the independent review — that's still true and is the next action.
- Along the way: fixed PR #347's real merge conflict against the arc (an id collision — two sessions independently minted `rec-20260801-002`/`-003` for unrelated content) by reconstructing the ledger merge programmatically rather than hand-splicing JSON conflict markers; re-minted the two HIGH findings to `rec-20260801-008`/`-009`, PR #347 merged clean.
- Confirmed `kernel-arc-work`'s "zombie" concern from the prior handoff was real (live commit activity, unpushed), then finished normally — it shipped phase 244 (settle-time guard) + a real finding: **the entire arc had been settling under `mock` verification on all 7 gate-provider seams**, activated `host-cli` for `perTaskVerifier` (only fully-wired seam initially).
- User asked a side question ("more than 1 verifier mappable to host-cli?") that uncovered a real, separate bug: `docs/providers.md` has claimed "host-cli wired for only per-task-verify" since it was written, but phase 191 (v1.46.0) and phase 205 wired all 7 families — the doc was just never updated. Fixed on `main` directly (unrelated to the arc), PR #350, merged.
- A **third, independent concurrent session** (`kernel-arc-rec-correction` worktree, not spawned by me) discovered the same stale-doc root cause independently, corrected `rec-20260801-003` on the arc, and activated real `host-cli` for `deep-verify` + `code-review` (the two families that actually fire in `profile:auto`). Merged clean as PR #351, no conflict with my work — confirmed via its own PR body explicitly noting my parallel doc fix.
- **Next action (per the user, starting fresh next session): scope what it'd take to fix the two HIGH findings** (`rec-20260801-008`/`-009` — finding-identity hash instability under real providers, and instability across the DRAFT-amendment/anchor-earning workflow) before deciding the arc→main merge path.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 4 ahead / 1 behind origin
- HEAD `033586a6`
- Recent commits:
```
033586a6 chore(cadence): stamp session handoff — kernel-arc-phase244-shipped-verifier-activated
f1ebd016 chore(cadence): stamp session handoff — kernel-arc-merge-decision-review-recs-filed
e6a2d1d6 chore(cadence): stamp session handoff — kernel-arc-phase242-merged-pr346
fef5b224 chore(cadence): stamp session handoff — phase243-mock-banner-shipped-recs-filed
90887434 chore(cadence): session handoff stamp + CLAUDE.md model-selection docs (#345)
db225ace fix: loud banner on every seam's credential-missing downgrade (phase 243) (#344)
c29bd4ec chore(cadence): session handoff -- v1.52.0 released, rec-20260731-001 filed (#343)
c56532d9 chore(cadence): file rec-20260731-001 (release-currency doctor check) (#342)
```
- Uncommitted (diff --stat):
```
.claude/scheduled_tasks.lock | 1 -
 1 file changed, 1 deletion(-)
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
- PR #347 merged into `feat/kernel-assurance-v2`: rebased onto the arc's moved tip, resolved a real ledger id collision (`rec-20260801-002`/`-003` and their evidence, re-minted to `-008`/`-009` with a documented provenance note on each via `cadence recommendation evidence add`), verified with `cadence doctor`'s `orphaned-evidence` check, CI green, squash-merged.
- PR #350 merged into `main`: rewrote `docs/providers.md`'s host-cli section (all 7 verifier families have real builders, not just per-task-verify — shipped in v1.46.0/phase 191 and phase 205), added the previously-undocumented `ui-spec-review` rows to both gate tables. Full `pnpm turbo run lint typecheck test build` green (full-turbo cache hit, docs-only change).
- Observed (not authored by this session): PR #351 merged into the arc — `kernel-arc-rec-correction`'s independent fix of `rec-20260801-003` + real `host-cli` activation for `deep-verify`/`code-review`.
- Cleaned up two now-merged local worktrees (`providers-docs-fix`, and confirmed `kernel-arc-rec-correction` self-cleaned).

## Carry-forward gotchas
- **This checkout's `main` is 1 behind origin** (`origin/main` has `0df76694`, this PR #350's own squash-merge commit — done in a separate worktree, never pulled back here). Own work, not a conflict; just `git pull --ff-only` before further work on `main`.
- **The 4 "ahead" commits are all pre-existing handoff-stamp chores from other sessions** (topmost `033586a6`, then `f1ebd016`/`e6a2d1d6`/`fef5b224`), not this session's — same as multiple prior handoffs have already noted. Still unpushed; default answer to "push?" is no per standing preference, ask first.
- **The two HIGH findings are now `rec-20260801-008` and `rec-20260801-009`** (re-minted from `-002`/`-003` during the PR #347 conflict resolution) — don't go looking for `-002`/`-003` on the arc, they're gone/reassigned (`-002` was also independently reused by the `kernel-arc-rec-correction` session for an unrelated already-merged host-cli rec, since archived).
- The arc (`feat/kernel-assurance-v2`) has moved three more times since the last real merge-safety test (PRs #347, #350 doesn't touch it, #351) — re-run the scratch-worktree merge test (branch off `main`/`origin/<ref>` into a scratch dir, merge, `pnpm install && pnpm turbo run lint typecheck test build`, clean up) before any real merge-to-main decision, per the reusable procedure noted in the prior handoff.
- `gh pr merge --delete-branch` continues to fail its local post-merge checkout step in this repo (hit again twice this session, two different causes: a stale dangling ref, and `main` already checked out in the primary worktree) — the remote merge always succeeds regardless; verify via `gh pr view <n> --json state,mergedAt,mergeCommit` and clean up the remote branch manually with `git push origin --delete <branch>` if `--delete-branch` didn't get to run.
- Two more live concurrent sessions were observed on this project during this session (multiple `claude` PIDs with cwd = primary checkout, separate from the worktree ones) — their existence/activity wasn't otherwise investigated; if `main` has unexpected new commits at resume time, check before assuming corruption.

## Next action
**Action:** Scope what it would take to fix the two HIGH findings on the arc's ledger: `rec-20260801-008` (finding-identity hash includes raw LLM message text — real-provider re-wording defeats ledger dedup; `packages/core/src/verify/finding-identity.ts`) and `rec-20260801-009` (finding id isn't stable across the DRAFT-amendment/anchor-earning workflow; same file, see `packages/core/tests/verify/criteria-anchor-corpus.test.ts`'s "AC-5 round trip" test). Read both recs in full (`cadence recommendation show rec-20260801-008` / `-009` against the arc branch — they don't exist on `main`'s ledger) plus `computeFindingId`'s current implementation, and produce a scoped fix plan (or confirm hold/risk-accept if scope is too large) before touching the arc→main merge decision itself.
**Verify:** A concrete plan exists — either a phase-sized fix scope with a rough task breakdown, or an explicit operator decision to accept the risk and merge anyway with these tracked as known-issues.
**If it fails:** If the fix looks bigger than a quick phase, don't scope-creep into fixing it solo — bring the sizing back to the operator and let them decide fix-now vs. hold vs. accept-risk, per this repo's own "don't decide unilaterally which risk to accept" convention.
