---
cadence_handoff: 1
generated_at: 2026-07-26T01:03:47.701Z
label: phase-222-shared-adapter-toolkit-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 2dcc5509
git_ahead: 5
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-26 (phase-222-shared-adapter-toolkit-shipped)

## TL;DR for the next session
- **Phase 222 (rec-20260725-005, "shared adapter toolkit") is shipped**: [PR #305](https://github.com/manehorizons/cadence/pull/305) merged as `1f70e66b`, all 14 CI checks green. New package `@manehorizons/cadence-host-toolkit` extracts the hook-routing shape + slash-command catalog (fixing a real drift bug — Codex's `cadence-dispatch` had silently lost its `DISPATCH_DIALOGUE` body), install.ts's managed-marker merge, and locate-self.ts. Core now enforces a new `HostCapabilities.agentIdentification` flag end-to-end (Codex's CLI embeds its capabilities into the real hook payload). `rec-20260725-005` promoted to `shipped` (`--ref "phase 222-shared-adapter-toolkit / PR #305"`, worktree-local id was `rec-20260725-004`).
- Loop is IDLE, nothing in flight in the primary checkout. Local `main` is fully synced (`ahead 5 / behind 0`) — the 5 ahead are pre-existing unpushed handoff-stamp commits from prior sessions (not this session's doing) plus this session's own `main` sync work.
- **Full pipeline this session**: `/resume` → resolved a real ledger id-collision on sync (upstream's shipped `rec-20260725-003` MCP-parity vs. local's different, still-open `rec-20260725-003` "convergent-review" candidate — re-minted the local one fresh as `rec-20260725-008` rather than clobbering either side) → picked `rec-20260725-005` (shared adapter toolkit) → fresh worktree (`.claude/worktrees/222-shared-adapter-toolkit`) → had to hand-bootstrap `state.json` (fresh worktree has `.cadence/` committed but not the gitignored state file, and `cadence init` refuses since `.cadence/` already exists — filed as `rec-20260726-001`) → minted the rec fresh via CLI → SPEC/DRAFT (3 ACs, 4 tasks) → wave-based build (T1+T4 wave 1, T2+T3 wave 2) → every task independently re-verified in the main thread, catching 2 real gaps the subagents' own "done" reports missed (see gotchas) → whole-branch review caught 2 more real gaps (missing changeset, stale `CLAUDE.md` package table) → single-commit settle → PR → CI green → merged (consent-gated, user said yes) → synced `main`, resolving a second ledger duplicate (content-duplicate under a different id this time, not a literal collision).
- 3 more `ready-for-milestone` recs sit in the primary checkout's ledger, uncommitted: `rec-20260725-006` (centralize gate bypass/seal policy), `rec-20260725-007` (split settleService), `rec-20260725-008` (deepen convergent-review protocol). Plus the new `rec-20260726-001` (cadence's own fresh-worktree init gap, filed this session). Each needs its own fresh worktree + CLI-replay mint per the standing convention — don't file-copy the ledger JSON.
- The `222-shared-adapter-toolkit` worktree still exists on disk (`.claude/worktrees/222-shared-adapter-toolkit`) — branch merged and deleted remotely, safe to `git worktree remove` whenever convenient; not urgent. Same is true for the older `171-installer-...` and `220-praxis-ledger-unify` worktrees (both already-merged, confirmed this session).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 5 ahead / 0 behind origin
- HEAD `2dcc5509`
- Recent commits:
```
2dcc5509 chore(cadence): stamp session handoff — 2026-07-25 (phase 221 mcp-cli-parity shipped)
7c79a3f7 fix: revert accidental inclusion of ephemeral intelligence-ledger telemetry in handoff commit
c2769e49 chore(cadence): stamp session handoff — 2026-07-25 (phase 219 shipped)
a75f24e9 chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 and flake fix shipped)
bb8d552d chore(cadence): stamp session handoff — 2026-07-25 (v1.51.0 shipped)
1f70e66b feat: extract shared adapter toolkit for host-claude-code and host-codex (phase 222-shared-adapter-toolkit) (#305)
e9f6556e fix: give the MCP surface real one-engine parity with the CLI (phase 221-mcp-cli-parity) (rec-20260725-003) (#304)
655663e5 feat: unify the five Praxis intelligence ledgers onto one shared module (phase 220) (#303)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/RECOMMEND.md         |  91 +++---
 .cadence/intelligence/RECOMMENDATIONS.md   |  64 ++++
 .cadence/intelligence/evidence.json        |  28 ++
 .cadence/intelligence/recommend.json       | 483 +++++++++++++++++++++++++++--
 .cadence/intelligence/recommendations.json | 135 +++++++-
 5 files changed, 731 insertions(+), 70 deletions(-)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-008 — Deepen the convergent-review protocol (candidate/ready-for-milestone)
  - rec-20260725-006 — Centralize gate bypass and seal policy in the settle driver (candidate/ready-for-milestone)
  - rec-20260725-007 — Split the settleService god function (candidate/ready-for-milestone)
  - rec-20260726-001 — Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it (candidate/ready-for-milestone)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
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
  - `packages/core/src/verify/converge.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/plan-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/code-review.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/services/spec-approve.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/types.ts` — affected by rec-20260725-008 Deepen the convergent-review protocol
  - `packages/core/src/gates/build-test-must-pass.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/boundary-scan.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/structural-verifier.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/gates/per-task-verify.ts` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `docs/reference/config.md` — affected by rec-20260725-006 Centralize gate bypass and seal policy in the settle driver
  - `packages/core/src/services/settle.ts` — affected by rec-20260725-007 Split the settleService god function
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260726-001 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `packages/core/src/state/simple.ts` — affected by rec-20260726-001 Fresh worktree has .cadence/ but no state.json — cadence init refuses to bootstrap it
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger

## What landed this session
- Phase 222 fully shipped: `@manehorizons/cadence-host-toolkit` (new 6th package, 5th to publish), `rec-20260725-005` promoted shipped.
- Two real gaps caught during independent re-verification (not from the subagents' own reports):
  1. T1's subagent extracted `routing.ts`'s `COMMANDS` catalog but never wired `install-commands.ts` to actually consume it (files: list gap in my own DRAFT authoring) — fixed by the orchestrator directly.
  2. T4's subagent built the core-side `HostCapabilities` check but nothing populated `ctx.raw.hostCapabilities` for a real Codex hook call — the mechanism was test-only, inert in production. Fixed by wiring `packages/host-codex/src/cli.ts` to embed `codexCapabilities` into the real hook payload.
- T2's subagent made a well-reasoned, verified-correct deviation: declined to re-export host-claude-code's `mapEvent`/`extractPayload`/`routeHookEvent` for host-codex because Codex's `apply_patch`-based extraction genuinely differs (not just duplicated) — only the structurally-identical `RouteResult` type is shared. Confirmed by reading both adapters' `event-map.ts` directly.
- Coverage thresholds in `vitest.shared.ts` recalibrated twice (interim after T1, final after T2+T3) since well-tested code moved out of both adapters' `src/**` into the new package.
- Whole-branch review caught 2 Important findings (both fixed before settle): missing `.changeset/*.md`, and `CLAUDE.md`'s "Five packages... four published packages" language gone stale.

## Carry-forward gotchas
- **A fresh `EnterWorktree` worktree cannot run any `cadence` command until `state.json` is hand-bootstrapped.** `.cadence/` is committed (config.json, ROADMAP.md, phases/) but `state.json`/`STATE.md` are gitignored since phase 196 and never get copied into a new worktree; `cadence init` refuses because it only checks whether `.cadence/` exists, not whether `state.json` specifically is missing. Filed as `rec-20260726-001` — until it's fixed, hand-write a minimal `state.json` (schemaVersion 1, revision 0, project.createdAt copied from the primary checkout's own state.json, loopPosition IDLE, empty arrays/maps) before running any `cadence spec/draft/build/settle` command in a fresh worktree.
- **`files:` lists in a DRAFT are a floor, not a ceiling — and my own DRAFT for phase 222 under-declared twice.** Neither T1 nor T2's `files:` list included `install-commands.ts` even though AC-1 explicitly required the slash-command catalog to be *consumed*, not just extracted; T4's list didn't include `host-codex/src/cli.ts`, needed to actually wire the capability check end-to-end. Both were legitimate boundary-floor expansions (confirmed correct by the whole-branch review), but writing a tighter DRAft next time — enumerating every file that *consumes* new shared code, not just where it's defined — would avoid the extra orchestrator-side patching.
- **The convergent-review-protocol id collision on `/resume`'s sync is now a documented pattern (see memory `cadence-rec-id-collision-on-rebase`)**: this session hit it twice — once as a literal id collision (`rec-20260725-003` meant two different things locally vs. upstream) and once as a content-duplicate-under-a-different-id (`rec-20260725-005` locally duplicated what shipped as upstream's `rec-20260725-004`). Neither is caught by git's conflict markers alone in the second case — check `cadence recommendation list` for suspicious "candidate" duplicates of recently-shipped work after every post-merge rebase, even when the rebase reports no conflicts.
- The `222-shared-adapter-toolkit`, `220-praxis-ledger-unify`, and `171-installer-settings-parse-failure-recovery` worktrees are all stale (branches merged + deleted remotely) — safe to `git worktree remove` in a batch whenever convenient.

## Next action
**Action:** Pick the next unit of work from the ledger: `rec-20260725-006` (centralize gate bypass/seal policy — docs already stale, a Doc Drift instance), `rec-20260725-007` (split the 545-line `settleService`), `rec-20260725-008` (deepen the convergent-review protocol — dedupe the copy-pasted `ConvergenceSidecar` logic across 4 gate call sites), or `rec-20260726-001` (fix cadence's own fresh-worktree `state.json` bootstrap gap — smallest of the four, and would remove a real friction point from every future phase-build). Each needs its own fresh worktree + CLI-replay mint, not a file-copy of the uncommitted JSON.
**Verify:** `git status --short --branch` in the primary checkout should show `ahead N / behind 0`; `cadence progress` should show IDLE with no active phase/draft; `cadence recommendation list` should show exactly `rec-20260725-006/007/008` and `rec-20260726-001` as the open `ready-for-milestone` candidates (no stray duplicates of already-shipped work).
**If it fails:** if a future `main` sync produces a `recommendations.json`/`evidence.json` conflict — or no conflict but a suspicious ledger duplicate — see the carry-forward gotcha above and `cadence-rec-id-collision-on-rebase` in persistent memory for the exact resolution method (diff new-id sets against the merge-base, take the fuller/canonical side, re-mint the other fresh via CLI, never hand-splice).
