---
cadence_handoff: 1
generated_at: 2026-07-24T21:51:45.236Z
label: phase-216-shipped
loop_position: IDLE
active_phase: 
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: da429cad
git_ahead: 5
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-24 (phase-216-shipped)

## TL;DR for the next session
- This session resumed via `cadence resume`, promoted `rec-20260724-005` ("close the trust envelope: gate the SETTLE capability class in MCP serve"), ran it through milestone → SPEC → DRAFT → BUILD → SETTLE in an isolated worktree, and shipped it as **PR #296**, squash-merged, all CI green (including both Windows legs).
- The fix: `cadence_settle`'s MCP `run()` is now wrapped with the same trust-envelope pre-check (`gatedRun`) the two `APPROVAL_BYPASS` tools already used — a call with no valid grant is refused before `settleService` runs. `enforceApprovalBypassGrant` was renamed to `enforceGatedToolGrant` (it now gates three tools, not two). Also closed real doc drift this created in `docs/concepts.md`, `docs/mcp.md`, `docs/reference/commands.md`, `mcp-trust.ts`, `mcp-trust-grant.ts` — all previously said `cadence_settle` was "left ungated this phase" (phase 181's deliberate boundary, now closed).
- Loop is IDLE, nothing in flight. Local `main` is 5 ahead / 0 behind origin — all handoff/chore bookkeeping commits, intentionally left unpushed (push only when switching machines).
- `rec-20260724-005`'s `shippedRef` reads `"phase 216-settle-capability-gate / PR #TBD"`, not the real PR number — `cadence recommendation promote` refuses on an already-archived/shipped rec (tried updating it to "PR #296" post-merge, got `recommendation promote refused: ... not found`). This matches existing precedent: `rec-20260724-001` has carried an unresolved `PR #TBD` in the ledger since phase 214 with no CLI path to fix it. Not a blocker, just a known cosmetic gap — worth a rec of its own if it keeps recurring.
- No blockers. Next session should run `cadence recommend` fresh to pick the next unit of work — nothing pre-selected this time (unlike the last two handoffs).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 5 ahead / 0 behind origin
- HEAD `da429cad`
- Recent commits:
```
da429cad chore(cadence): stamp session handoff — 2026-07-24 (next: rec-20260724-005)
934b5ed9 chore(cadence): stamp session handoff — 2026-07-24 (phase 215 shipped)
00d5fc90 chore(cadence): stamp session handoff — 2026-07-24 (phase 213 shipped)
888a8eb1 chore(cadence): stamp session handoff — 2026-07-24
522b9ce9 chore(cadence): stamp session handoff — 2026-07-24
621f87fd feat: close the trust envelope, gate the SETTLE capability class in MCP serve (phase 216-settle-capability-gate) (rec-20260724-005) (#296)
df621ef9 docs: audit sessions ledger-diff findings before closing (phase 215-p0-escape-retro-ledger-diff) (rec-20260724-002) (#295)
1cf84ce5 chore(security): document postcss audit exception (GHSA-r28c-9q8g-f849) (#294)
```
- Loop: IDLE · phase (none) · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260724-003 — Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency (candidate/needs-decision)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260724-006 — Signed or tamper-evident SUMMARY attestations (candidate/needs-decision)
  - rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state (candidate/needs-evidence)
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
- Files in play:
  - `CHANGELOG.md` — affected by rec-20260724-003 Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency
  - `.github/workflows/release.yml` — affected by rec-20260724-003 Generate CHANGELOG entries from settle artifacts and gate releases on changelog currency
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/types/src/summary.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `packages/core/src/services/settle.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `docs/team-rollout.md` — affected by rec-20260724-007 Define and document multi-contributor concurrency semantics for .cadence state

## What landed this session
- **Phase 216-settle-capability-gate (216-01)**, closing `rec-20260724-005`, landed as **PR #296** (squash-merged as `621f87fd`).
  - `packages/core/src/mcp/tools.ts`: `cadence_settle`'s `run` wrapped with `gatedRun('cadence_settle', ...)`; its MCP `description` extended to document the new grant requirement; the stale `CapabilityClass` doc block rewritten.
  - `packages/core/src/mcp/trust/enforce.ts`: `enforceApprovalBypassGrant` renamed to `enforceGatedToolGrant` (pure rename, logic unchanged — it was already generic over any `ToolDef`).
  - `packages/core/src/services/mcp-trust-grant.ts`, `packages/types/src/mcp-trust.ts`: doc comments updated (were already functionally correct — `GATED_CLASSES` already included `SETTLE` from phase 181 — only the comments were stale).
  - Tests: 8 new tests in `packages/core/tests/mcp/trust/enforce.test.ts` (4 unit + 2 MCP-integration, mirroring the existing `APPROVAL_BYPASS` coverage), written TDD-first and confirmed red before the implementation (the red run's no-grant integration test tellingly hit the *wrong* refusal — the unrelated evidence-floor gate — proving `cadence_settle` really was running ungated). `packages/core/tests/mcp/mcp-server.test.ts` fixed: an existing end-to-end test called `cadence_settle` with no grant seeded and now correctly gets refused, so both call sites now seed a `cadence_settle` grant first (mirroring the existing `cadence_draft_approve` pattern), and the missing-coverage assertion was sharpened to check the actual gate message instead of just `isError`.
  - Docs: `docs/concepts.md`, `docs/mcp.md`, `docs/reference/commands.md` updated to describe `cadence_settle` as gated (all three previously said it was "left ungated this phase").
  - `.changeset/settle-capability-gate.md`: minor bump for both `cadence-core` and `cadence-types` (same bump-type precedent as phase 181's original envelope changeset).
- Pipeline used: `phase-build` skill (implementer subagent → independent reviewer subagent → main-thread re-verification → whole-branch review subagent → settle → `pr-land` skill). The whole-branch review caught one real gap the per-task reviewer missed (`docs/mcp.md` was still describing only 2 gated tools) — fixed before settling, exactly the pattern this repo's process exists to catch.
- Full `pnpm turbo run lint typecheck test build` (20/20 tasks) run clean multiple times across the session; `cadence-core`'s own suite is 354 test files / 3140 tests, all green.

## Carry-forward gotchas
- **`cadence recommendation promote` cannot touch an already-shipped/archived rec** — refuses with `not found` even though the entry is still physically present in `recommendations.json` (just moved into the archived section). So a `shippedRef` written before the real PR number is known (e.g. `"phase NNN / PR #TBD"`) has no CLI path to be corrected afterward. This matches prior precedent (`rec-20260724-001` from phase 214 still shows `PR #TBD`) — evidently a known, currently-unaddressed gap, not something new this session broke. If it recurs again, it's probably worth its own recommendation (`cadence recommendation edit-ref` or similar for archived entries) rather than continuing to hand-wave past it.
- **`gh pr merge --squash --delete-branch` again hit the known local-checkout-failure pattern** (`'main' is already used by worktree...`) — this is now confirmed hit across many sessions in a row. Remote merge always succeeds regardless (verify via `gh pr view --json state,mergedAt,mergeCommit`); the remote branch also didn't auto-delete this time, cleaned up manually with `git push origin --delete <branch>`.
- After the merge, primary-checkout `main` was `ahead 5 / behind 1` (5 local unpushed handoff-stamp commits, 1 new commit from the just-merged PR). `git rebase origin/main` replayed cleanly with zero conflicts — worth remembering this is safe when the local-only commits are purely `.cadence/handoff/*` bookkeeping with no source overlap.
- The DRAFT for this phase originally split source (T1) and tests (T2) into two separate tasks with `T2 depends: T1` — this session caught that this breaks TDD's red-before-green ordering (the test file couldn't exist with a failing assertion before the source task landed) and merged them into a single T1 before dispatching a build subagent. Worth remembering when authoring future DRAFTs: keep a task's source + its own tests in the *same* task boundary unless there's a real reason to split (phase 181's T5 already established this pattern; this session's original DRAFT accidentally deviated from it).

## Open (not urgent)
- `docs/reference/commands.md`'s `trust` behavior section and `docs/mcp.md`'s trust-envelope paragraph are now in sync describing all three gated tools (`cadence_draft_approve`, `cadence_spec_approve`, `cadence_settle`) — if a future phase adds a fourth gated tool, both files (plus `docs/concepts.md`) need the same three-way update this session just did.

## Next action
**Action:** Run `cadence recommend` to pick the next unit of work — none was pre-selected this handoff, unlike the last two sessions. Follow the same loop: promote → (milestone propose/accept/export if it's a Praxis rec) → SPEC → DRAFT → BUILD → SETTLE → land via PR, using `phase-build` + `pr-land` skills inside an isolated worktree.
**Verify:** `cadence progress` should show `IDLE` with no active phase/draft before starting anything new.
**If it fails:** if `cadence recommend` surfaces nothing actionable (all candidates `needs-decision`/`needs-evidence`), check the "Top recommendations" list above (pre-filled from this handoff's generation) for one already `ready-for-milestone`, or ask the operator which gray-area rec (`rec-20260724-003/004/006/007`, all `needs-decision`) to resolve first.
