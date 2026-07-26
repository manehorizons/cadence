---
cadence_handoff: 1
generated_at: 2026-07-25T23:38:22.571Z
label: phase-221-mcp-cli-parity-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: c8aaac2a
git_ahead: 4
git_behind: 1
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-25 (phase-221-mcp-cli-parity-shipped)

## TL;DR for the next session
- **Phase 221 (rec-20260725-003, "MCP surface parity with the CLI") is shipped**: [PR #304](https://github.com/manehorizons/cadence/pull/304) merged as `e9f6556e`, all 14 CI checks green (every OS/Node leg, CodeQL, audit, sbom, secret-scan). `rec-20260725-003` promoted to `shipped` (`--ref "phase 221-mcp-cli-parity / PR #TBD"`, matching this repo's established convention of not knowing the PR number at settle-commit time).
- Full pipeline this session: `cadence resume` (surfaced a fresher sibling-worktree handoff over the replayed doc — see gotcha below) → picked from 5 fresh `rec-20260725-00[3-7]` candidates left uncommitted in the primary checkout by the prior session → fresh worktree (`.claude/worktrees/221-mcp-cli-parity`) → minted the rec fresh via CLI (not file-copied) → SPEC/DRAFT (3 ACs, 4 TDD-shaped tasks) → wave-based `phase-build` (T1+T2 parallel wave 1, T3 wave 2, T4 wave 3 — waves auto-split by `dispatch plan`'s file-overlap detection since T1 and T3 both touch `mcp/tools.ts`) → every task independently re-verified in the main thread (diff read + tests/typecheck re-run myself) before recording DONE → whole-branch review (one Minor, fixed) → single-commit settle → PR → land.
- Loop is IDLE, nothing in flight in the primary checkout. The phase worktree (`.claude/worktrees/221-mcp-cli-parity`) still exists on disk — its branch is merged and deleted remotely, safe to `git worktree remove` whenever convenient.
- **Primary checkout's local `main` is ahead 4 / behind 1 vs origin** — pre-existing drift from before this session (4 unpushed handoff-stamp commits) plus now behind the just-merged phase 221 commit. Deliberately NOT synced this session (operator chose to leave it, given the real ledger-conflict risk the prior 220 session hit doing exactly this). Next session should resolve this first if touching the ledger.
- 4 more `ready-for-milestone` recs remain uncommitted-only in the primary checkout's ledger dirt: `rec-20260725-004` (MCP/CLI parity — **already done, this is the stale local duplicate of the rec THIS phase shipped under its own fresh worktree-local id `rec-20260725-003`; do not redo it**), `rec-20260725-005` (shared adapter toolkit for host-claude-code/host-codex), `rec-20260725-006` (centralize gate bypass/seal policy), `rec-20260725-007` (split settleService). Each needs its own fresh worktree + CLI-replay mint, per the standing carry-forward convention — don't file-copy the ledger JSON.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 4 ahead / 1 behind origin
- HEAD `c8aaac2a`
- Recent commits:
```
c8aaac2a fix: revert accidental inclusion of ephemeral intelligence-ledger telemetry in handoff commit
db787dcd chore(cadence): stamp session handoff — 2026-07-25 (phase 219 shipped)
71071dad chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 and flake fix shipped)
188a5830 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 shipped)
655663e5 feat: unify the five Praxis intelligence ledgers onto one shared module (phase 220) (#303)
e05922e8 fix: cross-check evidence.json in recommendation id-minting (phase 219-recommendation-id-cross-check) (rec-20260724-013) (#302)
7a72d830 fix(release): give post-publish npm verification a patient retry budget (phase 218-release-verify-retry-budget) (rec-20260725-001) (#301)
d7dedf12 chore(release): v1.51.0 -- SETTLE trust-envelope gate, evidence-floor gate, CHANGELOG-currency gate, retro friction scoring (#300)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md         |  97 ++++--
 .cadence/intelligence/RECOMMENDATIONS.md   |  80 +++++
 .cadence/intelligence/evidence.json        |  35 ++
 .cadence/intelligence/recommend.json       | 527 +++++++++++++++++++++++++++--
 .cadence/intelligence/recommendations.json | 182 +++++++++-
 5 files changed, 852 insertions(+), 69 deletions(-)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-003 — Deepen the convergent-review protocol (candidate/ready-for-milestone)
  - rec-20260725-004 — Give the MCP surface real "one engine" parity with the CLI (candidate/ready-for-milestone)
  - rec-20260725-005 — Extract the shared adapter toolkit for host-claude-code and host-codex (candidate/ready-for-milestone)
  - rec-20260725-006 — Centralize gate bypass and seal policy in the settle driver (candidate/ready-for-milestone)
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
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
  - `packages/core/src/verify/converge.ts` — affected by rec-20260725-003 Deepen the convergent-review protocol
  - `packages/core/src/gates/plan-review.ts` — affected by rec-20260725-003 Deepen the convergent-review protocol
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260725-003 Deepen the convergent-review protocol
  - `packages/core/src/services/spec-approve.ts` — affected by rec-20260725-003 Deepen the convergent-review protocol
  - `packages/core/src/gates/types.ts` — affected by rec-20260725-003 Deepen the convergent-review protocol
  - `packages/core/src/services/recommendation-add.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/recommendation-promote.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/recommendation-convert.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/recommendation-archive.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/handoff.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/resume.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/services/doctor.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/cli/commands/recommendation.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/cli/commands/milestone.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/mcp/tools.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/cli/commands/verify.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/cli/commands/next.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/core/src/cli/commands/explain.ts` — affected by rec-20260725-004 Give the MCP surface real "one engine" parity with the CLI
  - `packages/host-claude-code/src/shim.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-claude-code/src/event-map.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-claude-code/src/install.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-claude-code/src/install-commands.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-claude-code/src/locate-self.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-claude-code/src/capabilities.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/shim.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/event-map.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/install.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/install-commands.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/locate-self.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/host-codex/src/capabilities.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/types/src/host.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/types/src/guidance.ts` — affected by rec-20260725-005 Extract the shared adapter toolkit for host-claude-code and host-codex
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/boundary-scan.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/structural-verifier.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/per-task-verify.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `docs/reference/config.md` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function

## What landed this session
- Resumed via `cadence resume`; it flagged 2 other worktrees with resumable handoffs. Read the sibling `worktree-220-praxis-ledger-unify` handoff directly (freshest by timestamp) rather than trusting the replayed doc, confirmed phase 220/PR #303 was already merged, and confirmed via `gh pr view`/`git log` rather than taking either doc at face value.
- Picked `rec-20260725-004` ("MCP surface real one-engine parity with the CLI") from the 5 fresh architecture-review candidates left uncommitted by the 220 session, with operator sign-off via `AskUserQuestion`.
- New worktree `.claude/worktrees/221-mcp-cli-parity`; bootstrapped with `cadence onboard` + `pnpm install` + `pnpm build` (fresh worktrees have no `state.json`/`node_modules`/`dist`).
- Minted the rec fresh via `recommendation add` → `promote` → `milestone propose/accept/export` (landed as `rec-20260725-003` in this worktree's independent ledger numbering) — per the prior session's explicit carry-forward instruction not to file-copy the uncommitted JSON.
- Authored SPEC (3 ACs, grounded in code read live this session: confirmed the `--ref`/`shippedRef` MCP drop, the exact duplicated `hasNewlyProposed` literal in `milestone.ts`/`milestone-propose.ts`, and that `next`/`verify`/`explain` already had the right `(args, io)` service shape but lived in `cli/commands/`) and DRAFT (4 tasks), both passed their structural gates on the first try.
- `phase-build`: T1 (promote ref parity, + found/fixed a real latent bug where a shipped-promotion always returned `data: null`) and T2 (dedupe milestone predicate) ran in parallel wave 1; T3 (relocate next/verify/explain into `services/`, register 4 new MCP tools) ran alone in wave 2 because it shares `mcp/tools.ts` with T1; T4 (parity tests + docs sync) ran in wave 3. Every task got an independent implementer + independent reviewer + main-thread re-verification (tests re-run, diffs read) before being recorded DONE — never from a subagent's own report.
- Whole-branch review: "ready to merge", one Minor (a stale doc-comment in `config-explain/render.ts` referencing the old `cli/commands/explain.ts` location) — fixed inline before settle.
- `cadence settle run --auto`: all 3 ACs PASS, single settle commit `6b8713a5` (33 files) with `.changeset/mcp-cli-parity.md`, `rec-20260725-003` promoted to `shipped`.
- Opened, watched CI on (all 14 checks green), and squash-merged [PR #304](https://github.com/manehorizons/cadence/pull/304) → `e9f6556e` with operator consent at each gate (draft/DRAFT approval, settle, merge). Hit the known `gh pr merge --delete-branch` local-checkout failure (`'main' is already used by worktree`) — remote merge completed regardless, verified via `gh pr view`, remote branch deleted by hand.
- Declined to rebase the primary checkout's pre-existing unpushed commits onto the new origin tip this session — operator chose to leave that drift for a dedicated pass given the real conflict risk documented by the prior session.

## Carry-forward gotchas
- **`rec-20260725-004` in the primary checkout's uncommitted ledger dirt is a stale duplicate of what this phase already shipped** (minted independently as `rec-20260725-003` inside the 221 worktree's own ledger, per the mint-fresh-don't-copy convention) — do not redo this work under `-004`; treat it as already closed.
- **Primary checkout's local `main` is ahead 4 (pre-existing, unrelated to phase 221) / behind 1 (this phase's merge)** — left unsynced this session by explicit operator choice. Rebasing risks a real `milestones.json`/`recommendations.json` conflict, per the 220 session's own documented experience doing exactly this (two genuine parallel-addition conflicts, one requiring cross-checking against a subsequent revert). Resolve with the same method if tackled: cross-check every conflict resolution against the canonical merged-upstream copy, don't blind `--ours`/`--theirs`.
- The `221-mcp-cli-parity` worktree still exists on disk (`.claude/worktrees/221-mcp-cli-parity`) — branch merged and deleted remotely, safe to `git worktree remove` whenever convenient; not urgent.
- `dispatch plan`'s file-overlap detection is real and worth relying on: declaring the same file (`mcp/tools.ts`) in two tasks' `files:` lists was enough for it to correctly push T3 into its own wave after T1, with no manual sequencing needed.
- Per-task `files:` lists in a DRAFT should be treated as a floor, not a ceiling — T3's relocation of `next.ts`/`verify.ts`/`explain.ts` logic necessarily required updating two test files' import paths that weren't in its declared list (they'd fail to compile otherwise); the whole-branch review confirmed this was correct and non-blocking, but a tighter DRAFT would have declared them.
- Writing `- depends: none` literally in a hand-edited DRAFT task breaks `cadence dispatch plan` (it tries to resolve `'none'` as a real task id and fails loudly: `task T3 depends on unknown task 'none'`) — omit the `- depends:` line entirely when there's no dependency, don't write a placeholder value.
- `cadence recommendation promote --status=shipped --ref` in this repo's established convention uses `"phase <phase-id> / PR #TBD"` — the PR number genuinely isn't known yet at settle-commit time (PR is opened after settle), and this repo has never gone back to fill in the real number afterward across ~10 prior phases; don't treat `#TBD` as a bug to fix.

## Next action
**Action:** Decide between (a) resolving the primary checkout's ahead-4/behind-1 `main` drift first (safer to do alone, before starting new work that would add more uncommitted ledger dirt on top), or (b) picking the next unit of work directly: `rec-20260725-005` (shared adapter toolkit for host-claude-code/host-codex — has a real drift bug already, Codex silently dropping `agentId`/`agentType`), `-006` (centralize gate bypass/seal policy — docs already stale, a Doc Drift instance), or `-007` (split the 545-line `settleService`). Each of the latter three needs its own fresh worktree + CLI-replay mint (see gotcha above), not a file-copy of the uncommitted JSON.
**Verify:** `git status --short --branch` in the primary checkout should show the ahead/behind counts before deciding; `cadence progress` should show IDLE with no active phase/draft.
**If it fails:** if the `main` sync produces a `recommendations.json`/`milestones.json` conflict, cross-check every resolution against the canonical merged-upstream copy (e.g. `git show origin/main:.cadence/intelligence/recommendations.json`) rather than guessing — see the carry-forward gotcha above and the 220 session's own handoff for the exact method used last time.
