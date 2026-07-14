---
cadence_handoff: 1
generated_at: 2026-07-14T22:53:28.568Z
label: mcp-tool-trust-envelope-shipped
loop_position: IDLE
active_phase: 181-mcp-tool-trust-envelope
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 0df34b0
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-14 (mcp-tool-trust-envelope-shipped)

## TL;DR for the next session
- Resumed from a stale main-checkout handoff (phase 179, DRAFT) that turned out to be superseded — the real work-in-progress was phase 181 (MCP tool-trust envelope) mid-BUILD in a locked sibling worktree (`.claude/worktrees/mcp-tool-trust-envelope`) with T1–T5 already DONE from a prior session.
- Completed T6 (docs) via the standard phase-build convention (implementer subagent → independent adversarial reviewer → my own main-thread re-verification with a full `pnpm turbo run lint typecheck test build`), then ran a fresh whole-branch review (zero Critical/Important findings) before committing.
- **Phase 181 is fully shipped**: feature commit + settle commit in the worktree, PR #198 merged (all CI green), worktree removed, local/remote branches deleted, primary checkout fast-forwarded to origin/main.
- Also shipped a small follow-up: PR #199 marks `rec-20260710-006`/`rec-20260712-008`/`rec-20260712-011` (phases 178/180/181) `shipped` with their PR refs, clearing `cadence doctor`'s `recommendation-shipped-drift` warning.
- **No blocker.** Loop is IDLE. Next unit of work is un-started — either pick a top recommendation (see CADENCE context below) or draft one.
- One real CADENCE product gap was found and filed as `rec-20260714-003` (not fixed this session, by design — see gotchas): `--allow-auto-complex` bypasses at `draft approve`/`settle run` are never recorded in `SUMMARY.gateBypasses`, contradicting CLAUDE.md's claim that bypasses are always "loud and recorded in the SUMMARY."

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `0df34b0`
- Recent commits:
```
0df34b0 chore(cadence): mark rec-20260710-006, rec-20260712-008, rec-20260712-011 shipped (#199)
90364bb feat: MCP tool-trust envelope for cadence_draft_approve/cadence_spec_approve (phase 181) (#198)
c8b197a feat: redact secrets from evidence quotes and security-audit findings (phase 180) (#197)
b2a6a08 chore(cadence): mark rec-20260703-001 shipped (PR #195) (#196)
424aa8c feat: milestone fan-in worktree status/reconciliation command (phase 179) (#195)
462f239 feat: guardrails for headless-CLI verifier (phase 178) (#193)
9690536 chore(cadence): mark rec-20260712-007 shipped, stamp release handoff — v1.44.1 (#194)
7430b28 chore(release): v1.44.1 -- gate-throw audit, installer refusal, optimistic concurrency, retro artifact (#192)
```
- Uncommitted (diff --stat):
```
.cadence/state.json | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
```
- Loop: IDLE · phase 181-mcp-tool-trust-envelope · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260712-010 — Thread AbortSignal + deadline + trace id through gates, verifiers, and the headless-CLI verifier (candidate/needs-evidence)
  - rec-20260712-012 — Generate the command/config/exit-code reference from source and fail CI on drift (candidate/needs-evidence)
  - rec-20260712-013 — Add the missing CI security automation: CodeQL, secret scanning, npm-audit policy, SBOM, scheduled run (candidate/needs-evidence)
  - rec-20260712-015 — Smoke-test the packed npm tarball (clean install -> init -> settle), not just in-repo dist (candidate/needs-evidence)
  - rec-20260714-003 — gateBypasses omits the --allow-auto-complex soft-cap override (candidate/needs-evidence)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `packages/core/src/gates` — affected by rec-20260712-010 Thread AbortSignal + deadline + trace id through gates, verifiers, and the headless-CLI verifier
  - `packages/core/src/verify/security-audit.ts` — affected by rec-20260712-010 Thread AbortSignal + deadline + trace id through gates, verifiers, and the headless-CLI verifier
  - `docs/reference/commands.md` — affected by rec-20260712-012 Generate the command/config/exit-code reference from source and fail CI on drift
  - `docs/reference/config.md` — affected by rec-20260712-012 Generate the command/config/exit-code reference from source and fail CI on drift
  - `scripts` — affected by rec-20260712-012 Generate the command/config/exit-code reference from source and fail CI on drift
  - `.github/workflows` — affected by rec-20260712-013 Add the missing CI security automation: CodeQL, secret scanning, npm-audit policy, SBOM, scheduled run
  - `.github/dependabot.yml` — affected by rec-20260712-013 Add the missing CI security automation: CodeQL, secret scanning, npm-audit policy, SBOM, scheduled run
  - `scripts/publish-proof.mjs` — affected by rec-20260712-015 Smoke-test the packed npm tarball (clean install -> init -> settle), not just in-repo dist
  - `scripts/release-integrity.mjs` — affected by rec-20260712-015 Smoke-test the packed npm tarball (clean install -> init -> settle), not just in-repo dist
  - `.github/workflows/release.yml` — affected by rec-20260712-015 Smoke-test the packed npm tarball (clean install -> init -> settle), not just in-repo dist
  - `packages/core/src/services/settle.ts` — affected by rec-20260714-003 gateBypasses omits the --allow-auto-complex soft-cap override
  - `packages/core/src/services/draft-approve.ts` — affected by rec-20260714-003 gateBypasses omits the --allow-auto-complex soft-cap override
  - `packages/types/src/anomaly.ts` — affected by rec-20260714-003 gateBypasses omits the --allow-auto-complex soft-cap override

## What landed this session
- Diagnosed a resume discrepancy: the primary checkout's replayed handoff (phase 179, DRAFT) was stale; the authoritative state was `cadence resume --list`'s "sibling" candidate — a locked worktree's `SESSION-2026-07-14.md`, generated the same day, at BUILD for phase 181. Used that instead.
- T6 ("Document the trust envelope") implemented: `docs/reference/commands.md` (new `mcp trust grant/revoke/list` subcommand docs), `docs/concepts.md` (new "MCP tool-trust envelope" section), `docs/mcp.md` (fixed a now-stale "the tool call IS the approval" sentence, found live — legitimate scope, not creep), and the `cadence_draft_approve`/`cadence_spec_approve` MCP tool description strings in `packages/core/src/mcp/tools.ts`.
- Independent reviewer + my own re-run all confirmed: 55/55 doc-content tests, 2683/2683 unit tests, 20/20 turbo tasks green.
- Whole-branch review (fresh subagent, traced AC-1 end-to-end, grep-verified the CLI-only-grant security invariant, checked all 6 DRAFT boundaries) came back with zero Critical/Important findings; flagged 3 minor follow-ups, all handled before commit: reverted a stray `packages/core/bin/cadence.cjs` file-mode diff (644→755, unrelated noise), added `.cadence/mcp-trust.json` to `.gitignore` (operator-local security material, not shared state like `state.json` — explicit call, not the DRAFT's), and wrote `.changeset/mcp-tool-trust-envelope.md` (minor bump, `cadence-core` + `cadence-types`).
- Fixed a real phase-collision refusal: the primary checkout still had a stale, never-progressed, untracked copy of `.cadence/phases/181-mcp-tool-trust-envelope/` left over from an earlier session's manual worktree-seed transplant. Removed it (untracked, nothing lost) so `cadence settle run` could proceed from the worktree.
- Settled with `--allow-auto-complex` (draft was already approved under the same DESIGN.md §4 M2 auto×complex soft cap bypass). Discovered live that this bypass is **not** recorded in `SUMMARY.gateBypasses` (traced to `settle.ts`/`draft-approve.ts` only emitting a stderr notice, never an `AnomalyEvent`) — filed `rec-20260714-003` rather than silently letting it slide or scope-creeping a fix into this PR.
- Two-commit settle: `c695cd5` (feat) → `fd09b11` (chore settle) in the worktree → PR #198 → CI green on all 6 legs → squash-merged → `90364bb` on main. Worktree removed, local + remote `feat/mcp-tool-trust-envelope` branches deleted.
- PR #199 (`chore/mark-recs-shipped-178-180-181`): marked 3 recs shipped. Hit the documented settle-code-review flaky-family timeout on `ubuntu-latest,20` only (bookkeeping-only diff couldn't have caused it) — re-ran once per the flake protocol, went green, merged → `0df34b0` on main.

## Carry-forward gotchas
- `rec-20260714-003` (gateBypasses omits `--allow-auto-complex`) is filed but **not fixed**. It's a real, reproducible gap: `anomalyToGateBypass()` in `packages/core/src/services/settle.ts` only maps `coverage-bypassed`/`force-used`/`verifier-failure` `AnomalyEvent` types to a recorded `GateBypass`; the auto×complex soft-cap override (`draft-approve.ts:67`, `settle.ts:253`) only does `io.err(...)` and never emits an `AnomalyEvent`. Fix means adding a new `AnomalyEvent` type and wiring it into both call sites plus the mapping function — small, but touches `packages/types/src/anomaly.ts` too (schema change).
- Two other unrelated live-discovered gaps from the *prior* session (not this one) are still open, referenced in this phase's DRAFT/handoff trail: `rec-20260714-001` (milestone premortem's `outOfScope` field has no CLI writer) and `rec-20260714-002` (`draft add-task` missing a `--name` flag unlike `add-ac`). Neither was touched this session.
- The primary checkout had stale untracked `.cadence/phases/181-*` dirt (from an earlier manual worktree-seed transplant) that I deleted this session to unblock settle — if `cadence doctor`'s `worktree-phases` collision warning reappears for phase 181 specifically, check for the same leftover-transplant pattern before assuming it's a real new collision. (Note: `doctor` still reports a *large* worktree-phases collision list against `.claude/worktrees/171-installer-settings-parse-failure-recovery` — pre-existing, unrelated to this session, not investigated.)
- `.cadence/mcp-trust.json` is now gitignored — if you ever `cadence mcp trust grant` for local testing, that grant will not show up in `git status`/diffs; it's genuinely local-only by design.
- Editing the `cadence_draft_approve`/`cadence_spec_approve` description strings in T6 changes their structural def-hash (per T2's hash inputs: name+description+inputSchema). No grants existed in the worktree at the time, so nothing broke, but any grant issued *before* this PR against the old description text is now stale and needs re-granting.
- One stash exists on `main` from this session, `stash@{0}` — "handoff — stale pre-transplant .cadence dirt, superseded by merged phase 181 settle commit". Safe to drop once you've independently confirmed the merged `.cadence/` state has everything (it should — the settle commit was derived from a superset of that stashed content). Not dropped automatically per this repo's caution around discarding uncommitted work.

## Next action
**Action:** No phase is in progress — loop is IDLE. Run `cadence recommend` / review the CADENCE context above and pick the next unit of work. Reasonable candidates in rough priority order: `rec-20260714-003` (the gateBypasses gap just found — small, self-contained, directly improves this repo's own verification-honesty thesis), or one of the pre-existing top recs (`rec-20260712-010` AbortSignal/deadline threading, `rec-20260712-012` generated command reference, `rec-20260712-013` CI security automation, `rec-20260712-015` packed-tarball smoke test).
**Verify:** `cadence status` shows `loop: IDLE` with no active phase before starting; after drafting, `cadence draft check` should pass coherence before approving into BUILD.
**If it fails:** If `cadence resume` at the start of the next session again surfaces a sibling-worktree handoff instead of (or in addition to) the primary checkout's, treat the sibling as authoritative if it's fresher and at a further loop position — that pattern repeated across at least two recent sessions (this one and the one that produced `SESSION-2026-07-14.md` in the now-removed `mcp-tool-trust-envelope` worktree).
