---
cadence_handoff: 1
generated_at: 2026-07-12T20:38:52.596Z
label: phase174-shipped
loop_position: IDLE
active_phase: 173-optimistic-concurrency-for-cadence-state-writes
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 6fc52bd
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-12 (phase174-shipped)

## TL;DR for the next session
- Phase 174 (post-settle retro artifact + GitHub issue offer) is fully built, reviewed, settled, and merged to `main` via PR #184. Loop is `IDLE`, nothing in-flight.
- Sourced from `rec-20260712-001`. Two follow-on recs — `rec-20260712-002` (cross-phase retro rollup) and `rec-20260712-003` (feeds friction back into Praxis scoring) — explicitly depended on this one shipping first and are now unblocked candidates.
- Two real bugs were found and fixed *during* the build, not left in: (1) a friction-digest empty-check bug (a clean settle's gates can leave `codeReview: {}`/`securityAudit: []` present-but-empty on `Summary`, which a naive truthiness check misreported as friction — caught by independent review, fixed at the source); (2) a genuine CI-discovered design gap — the GitHub-issue offer could spawn a real, unmocked `gh` process during *any* `CADENCE_PROMPTER_SCRIPT`-driven test/automation run that happened to produce settle-time friction (hung Windows CI ~71s on a pre-existing, unrelated test) — fixed by requiring an actual TTY, not just the interactivity check, before any `gh` spawn or prompt.
- One known, narrower limitation was found (by the whole-branch review) and *documented rather than fixed*, deliberately out of this phase's scope: `createDefaultPrompter()` resets its `ScriptedPrompter` answer-cursor on every call, so a settle run that fires *both* the interactive-verdict gate and a friction-having retro offer under `CADENCE_PROMPTER_SCRIPT` doesn't share one answer stream across them. Scoped to the scripted/test-automation seam only (real TTY/human usage unaffected), fails safe (a mismatched answer just quietly declines, never a crash or a wrongly-filed issue). See the doc comment on `createDefaultPrompter` in `packages/core/src/verify/prompter.ts`.
- No blockers. Next action is confirming `rec-20260712-001`'s shipped status, then `cadence recommend` to pick the next phase.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 0 ahead / 0 behind origin
- HEAD `6fc52bd`
- Recent commits:
```
6fc52bd feat: post-settle retro artifact + GitHub issue offer (phase 174) (#184)
f0cf54e chore(cadence): mark rec-20260611-003 shipped, close its stale milestone entry (#183)
9cf19df chore(cadence): land 11 Praxis recs transferred from Lumen2 external audit (#182)
e38d86a feat: optimistic concurrency for cadence state writes (phase 173) (#181)
9fe2f50 chore(cadence): stamp session handoff — phase171-shipped-recs-recovered (#180)
65886dd chore(cadence): stamp session handoff — phase170-refusing-gate-provenance-landed (#179)
a645d8b fix: installer refuses malformed settings.json instead of wiping it (phase 171) (#176)
620878f chore(cadence): stamp session handoff — v1.44.0-release-workflow-in-flight (#175)
```
- Loop: IDLE · phase 173-optimistic-concurrency-for-cadence-state-writes · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260712-007 — Guarantee an audit/SUMMARY record when any settle gate throws (not just security-audit) (candidate/needs-evidence)
  - rec-20260703-001 — Milestone-scoped worktree fan-out for independent phases (candidate/needs-decision)
  - rec-20260712-011 — Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry) (candidate/needs-decision)
  - rec-20260710-006 — Guardrails for headless-CLI verifier: quota transparency, self-invocation loops, CI fallback (candidate/needs-evidence)
  - rec-20260712-008 — Redact secrets/credentials from persisted evidence quotes and SUMMARY.securityAudit findings (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `packages/core/src/services/settle.ts` — affected by rec-20260712-007 Guarantee an audit/SUMMARY record when any settle gate throws (not just security-audit)
  - `packages/core/src/gates/registry.ts` — affected by rec-20260712-007 Guarantee an audit/SUMMARY record when any settle gate throws (not just security-audit)
  - `packages/core/src/gates/security-audit.ts` — affected by rec-20260712-007 Guarantee an audit/SUMMARY record when any settle gate throws (not just security-audit)
  - `packages/core/src/worktree` — affected by rec-20260703-001 Milestone-scoped worktree fan-out for independent phases
  - `packages/core/src/cli/commands/milestone.ts` — affected by rec-20260703-001 Milestone-scoped worktree fan-out for independent phases
  - `DESIGN.md` — affected by rec-20260703-001 Milestone-scoped worktree fan-out for independent phases
  - `packages/core/src/mcp/tools.ts` — affected by rec-20260712-011 Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)
  - `packages/core/src/mcp/server.ts` — affected by rec-20260712-011 Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)
  - `packages/core/src/cli/commands/mcp.ts` — affected by rec-20260712-011 Define an MCP tool-trust envelope for 'cadence mcp serve' (origin + def-hash + capability scope + expiry)
  - `packages/core/src/intelligence/store/audit.ts` — affected by rec-20260712-008 Redact secrets/credentials from persisted evidence quotes and SUMMARY.securityAudit findings
  - `.cadence/intelligence/evidence.json` — affected by rec-20260712-008 Redact secrets/credentials from persisted evidence quotes and SUMMARY.securityAudit findings

## What landed this session
- Brainstormed + Fable-reviewed the design for post-settle retro artifact + GitHub issue offer (`docs/superpowers/specs/2026-07-12-post-settle-retro-artifact-design.md`, local-only).
- Wrote a 7-task implementation plan (`docs/superpowers/plans/2026-07-12-post-settle-retro-artifact.md`, local-only) and executed it subagent-driven in an isolated worktree: `RetroDigest` schema + `retro` config block (`@manehorizons/cadence-types`), `buildRetroDigest`/`isDigestEmpty`/`retroFrictionCount`, `renderRetroMd`, `writeRetroArtifacts`, a `gh` spawn layer (`resolveIssueTarget`/`createGithubIssue`/`addIssueLabel`), `askRetroIssueVerdict`/`runRetroOffer`, all wired into `settleService`.
- Consolidated a previously-duplicated prompter-factory closure (independent copies in `settle.ts` and `handoff/run-resume.ts`) into one shared `createDefaultPrompter()` in `verify/prompter.ts`.
- Every task had an independent adversarial code review; a whole-branch review followed; CI then caught the real `gh`-spawn bug above, root-caused and fixed with regression tests at both the unit and `settleService` level.
- Resolved a real git merge conflict landing this PR (origin/main had moved forward with an unrelated rec-ledger PR while this was being built) — `.cadence/state.json`/`STATE.md` conflicts resolved by taking origin/main's version (soft/cosmetic telemetry); `recommendations.json` auto-merged cleanly since the two branches' changes were to different recs.
- PR #184 merged (squash), branch deleted, phase worktree removed, stale remote-tracking ref pruned.

## Carry-forward gotchas
- **`rec-20260712-001` is at `settle-pending`, not yet promoted to `shipped`.** `cadence doctor` should flag "recommendation(s) settled but not yet confirmed shipped" — run `cadence recommendation promote rec-20260712-001 --status=shipped --ref "PR #184"` to close it out.
- **`.cadence/state.json`'s `activePhase` still reads `173-optimistic-concurrency-for-cadence-state-writes`** even though phase 174 has since shipped — this is stale/cosmetic, a side effect of how a git-level merge conflict on `state.json` was resolved while landing PR #184 (origin/main's version was taken as-is rather than hand-merging JSON, since the field is soft telemetry, not correctness-critical — `loopPosition`/`activeDraft` agreed on both sides). It'll self-correct on the next state-mutating `cadence` command. Don't be misled by it.
- **This handoff was written from a scratch worktree checked out to `origin/main`**, not the primary checkout — at handoff time, `/home/thomas/projects/cadence` (primary checkout) was on an unrelated branch `chore/close-mil-rec-20260710-002` (untouched by this session, no context on it here). If resuming from the primary checkout, check what's actually on it before assuming it reflects phase 174's landing.
- **Known, deliberately-undone limitation**: see TL;DR — `createDefaultPrompter()`'s per-call `ScriptedPrompter` cursor reset means a `CADENCE_PROMPTER_SCRIPT`-scripted settle run driving both the interactive-verdict gate and a friction-having retro offer won't share one answer stream. A real fix (one memoized `Prompter` per settle run) needs matching `close()`-lifecycle changes in `gates/approve.ts`/`gates/interactive.ts` and was judged out of phase 174's scope. Documented in `verify/prompter.ts`'s `createDefaultPrompter` doc comment and item 7 of the (local-only) implementation plan's Global Constraints.
- **Two follow-on recs are now unblocked**: `rec-20260712-002` (cross-phase retro rollup/trend view) and `rec-20260712-003` (recurring friction feeds back into Praxis recommendation scoring) both explicitly depended on `rec-20260712-001` existing first.
- The `deja` near-duplicate gate's `// deja:new` override only registers for "structural" tier matches, not "exact" tier ones (confirmed against the `deja` tool's own source at `~/projects/deja/src/gate/hook.js`) — a byte-identical duplicate stays a hard block even with a correctly-formed override comment, resolved only via the gate's built-in 3-strike auto-escalation during this build. Worth a look from the `deja` maintainer side — CLAUDE.md's documented override guidance doesn't currently match this behavior for exact-tier matches.

## Next action
**Action:** Run `cadence doctor` to confirm `rec-20260712-001`'s shipped status; if it's flagged as settled-but-unconfirmed, run `cadence recommendation promote rec-20260712-001 --status=shipped --ref "PR #184"`. Then run `cadence recommend` to re-rank and pick the next phase — `rec-20260712-002`/`rec-20260712-003` are now-unblocked follow-ons worth considering, or continue down the ranked list.
**Verify:** `cadence doctor` no longer lists `rec-20260712-001` under "settled but not yet confirmed shipped"; `cadence progress` shows `IDLE` / no active draft.
**If it fails:** if `cadence doctor` or `cadence recommendation promote` reports something unexpected about the rec's current status, read `.cadence/intelligence/recommendations.json` directly for `rec-20260712-001`'s `status`/`convertedToPhaseId` fields before guessing at a fix — don't assume this doc's account of it is still accurate.
