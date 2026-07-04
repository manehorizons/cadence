---
cadence_handoff: 1
generated_at: 2026-07-02T01:58:53.913Z
label: onboarding-honesty-wave1-shipped
loop_position: IDLE
active_phase: 138-docs-truth-pass
active_draft: 
tier: 
git_branch: feat/onboarding-honesty-wave1
git_dirty: true
git_head: 5ade6da
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-02 (onboarding-honesty-wave1-shipped)

## TL;DR for the next session
- The entire wave-1 "onboarding-honesty" milestone (`mil-grp-onboarding-honesty`) is **shipped**: all 6 recs from the 2026-07-01 audit (rec-002, 004, 005, 006, 007, 011) built as phases 133-138, each real-TDD'd, each a two-commit settle, full monorepo gate green after every phase.
- Work is on branch `feat/onboarding-honesty-wave1` (15 commits ahead of `main`), pushed to origin, **PR #117 open**: https://github.com/manehorizons/cadence/pull/117 — CI was still **pending** (not yet green) as of this handoff.
- Single next action: check `gh pr checks 117`; once CI is green, merge the PR. No blockers known — this exact code passed `pnpm turbo run lint typecheck test build` locally multiple times this session.
- No version bump / release was cut this session — `main` (and this branch) are still at `1.35.0`. Whether/when to cut a release for this wave is an open decision for the next session.
- Wave 2 of the same audit (recs 001, 003, 009 — the "enforcement wedge," deliberately the riskier/deeper cluster) is untouched — still `candidate`/`needs-decision` in the ledger, ready for the same treatment if wanted next.
- Two audit findings turned out already-fixed on investigation (not new bugs): rec-006's agent-prompt half (phase 130) and rec-011's README-flagship-walkthrough claim — documented in each phase's SPEC rather than silently dropped.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `feat/onboarding-honesty-wave1` (dirty), 0 ahead / 0 behind origin
- HEAD `5ade6da`
- Recent commits:
```
5ade6da chore(intelligence): mark rec-20260701-002 shipped
88af45b chore: settle 138-01
ad40a56 fix(docs): reconcile slash-command count + add activate to start menu
97e4e31 chore: settle 137-01
908e25a fix: refusal trio — concrete next-move everywhere
d21413e chore: settle 136-01
2b2c184 docs(readme): inline --no-approve pointer on the real-phase approve line
577f31f chore: settle 135-01
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md            | 2 +-
 .cadence/state.json          | 2 +-
 .claude/scheduled_tasks.lock | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)
```
- Loop: IDLE · phase 138-docs-truth-pass · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-001 — Make the default install enforce what the tutorial demonstrates (candidate/needs-decision)
  - rec-20260701-003 — SUMMARY gate provenance: record what ran, what skipped, and what PASS meant (candidate/needs-decision)
  - rec-20260701-008 — Structured draft editing: draft add-ac / add-task / set-objective (candidate/needs-decision)
  - rec-20260701-009 — Sealed gates: let production preset make named gates non-bypassable (candidate/needs-decision)
  - rec-20260701-010 — MCP parity for the intelligence lifecycle (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `packages/types/src/config.ts` — affected by rec-20260701-001 Make the default install enforce what the tutorial demonstrates
  - `packages/core/src/init/plan.ts` — affected by rec-20260701-001 Make the default install enforce what the tutorial demonstrates
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260701-001 Make the default install enforce what the tutorial demonstrates
  - `packages/core/src/settle/summary-writer.ts` — affected by rec-20260701-003 SUMMARY gate provenance: record what ran, what skipped, and what PASS meant
  - `packages/core/src/gates/deep-verify.ts` — affected by rec-20260701-003 SUMMARY gate provenance: record what ran, what skipped, and what PASS meant
  - `packages/core/src/parse/draft-scaffold.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/parse/draft-md.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/cli/commands/draft.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/gates/types.ts` — affected by rec-20260701-009 Sealed gates: let production preset make named gates non-bypassable
  - `packages/core/src/mcp/tools.ts` — affected by rec-20260701-010 MCP parity for the intelligence lifecycle
  - `packages/core/src/hooks/checks/boundary.ts` — affected by rec-20260701-012 Boundary enforcement block mode, including subagent edits
  - `packages/core/src/hooks/handlers.ts` — affected by rec-20260701-012 Boundary enforcement block mode, including subagent edits
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Resumed from the 2026-07-01 audit handoff; filed `audit-report-2026-07-01.html` under `.cadence/research/`.
- Promoted 6 wave-1 recs (002/004/005/006/007/011) → accepted/ready-for-milestone, tagged with a shared `suggestedMilestoneId`, clustered via `cadence milestone propose` into `mil-grp-onboarding-honesty`, accepted, exported to a staged SPEC.
- Phase 133: `cadence doctor`'s git-hooks check now verifies `.githooks/` exists before flagging, and never auto-overwrites a pre-existing custom `hooksPath` (e.g. Husky). (Scoped down from the original 6-rec bundled SPEC after redoing it to match this repo's one-feature-per-phase convention.)
- Phase 134: `cadence progress --json` — mirrors `recommend --json`'s pattern.
- Phase 135: `init --demo` no longer prints the generic "Your first loop"/"Hand it to your AI agent" blocks (both of which immediately refuse in DRAFT) alongside the correct demo instructions.
- Phase 136: README's real-phase walkthrough gets an inline `--no-approve` pointer at the approve line (investigation found the agent-prompt half of rec-006 already fixed in phase 130).
- Phase 137: refusal trio — BUILD-state `progress` names the real first-pending task (or `settle run --auto`) instead of an unrunnable compound command; `draft approve` on a missing DRAFT.md gives a clean guarded refusal instead of raw ENOENT; `settle run` out of position now also prints `Next: <command>` while keeping the existing loop-violation anomaly plumbing intact.
- Phase 138: slash-command count reconciled to the code-true 12 across README/quickstart/claude-code.md (fixed a broken TOC anchor in claude-code.md); `cadence start` menu gained an `activate` option (investigation found the README-flagship-walkthrough claim in the same rec already accurate, live-verified).
- Backfilled rec-20260701-002 to `status=shipped` — it had been built by hand-editing its SPEC instead of `spec new --from-rec`, so it never auto-archived on settle like 004-011 did.
- Created branch `feat/onboarding-honesty-wave1` from the 15 accumulated commits, pushed, opened PR #117.

## Carry-forward gotchas
- **PR #117 CI was pending, not confirmed green, at handoff time.** Check `gh pr checks 117` before merging — don't assume it's clean just because local `pnpm turbo run lint typecheck test build` was green (that was verified repeatedly, but cross-platform CI legs, e.g. Windows/macOS, have surprised before on this repo).
- **`main` still points at `8ed57dc` (v1.35.0)** — none of this session's commits are on `main` yet, only on the PR branch. Don't confuse "shipped to the loop/ledger" (phases settled, recs marked shipped) with "merged to main" or "released to npm" — neither has happened.
- Stray untracked handoff docs from prior sessions are still sitting in `.cadence/handoff/` (`SESSION-2026-06-26-phase-130-agent-prompt-pr-111.md`, `SESSION-2026-06-26-phase-131-doctor-fix-pr-pending.md`, `SESSION-2026-06-27.md`) — never cleaned up across multiple sessions now. Not addressed this session either (out of scope); worth a deliberate pass at some point.
- `.claude/scheduled_tasks.lock` shows as locally modified (a `subagentSpawns` counter bump) — pre-existing, unrelated drift; harmless to leave uncommitted or fold into a housekeeping commit later.
- Wave 2 recs (001, 003, 009) are the "enforcement wedge" — explicitly the deeper/riskier cluster per the original audit's own wave sequencing. Don't treat them as equally trivial diffs the way wave 1 mostly was; expect real design decisions (e.g. rec-009 "sealed gates" touches the gate model itself).

## Next action
**Action:** `gh pr checks 117` to see if CI has finished; if all green, `gh pr merge 117 --squash` (or ask the user how they want it merged — squash matches this repo's other PR history).
**Verify:** after merge, `git checkout main && git pull` and confirm `git log --oneline -1` shows the merge commit; `cadence progress` should report IDLE with no active phase.
**If it fails:** if a CI leg is red, `gh run view <run-id> --log-failed` to see which leg and why — this exact diff passed the full local gate (`pnpm turbo run lint typecheck test build`) multiple times, so a red CI leg is more likely a platform-specific flake (Windows/macOS path handling, timing) than a real regression; don't assume the fix is wrong without reading the actual failure first.
