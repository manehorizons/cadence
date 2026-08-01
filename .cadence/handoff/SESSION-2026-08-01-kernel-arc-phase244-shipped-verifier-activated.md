---
cadence_handoff: 1
generated_at: 2026-08-01T03:49:13.556Z
label: kernel-arc-phase244-shipped-verifier-activated
loop_position: IDLE
active_phase: 243-untitled
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: f1ebd016
git_ahead: 3
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-08-01 (kernel-arc-phase244-shipped-verifier-activated)

## TL;DR for the next session
- **Phase 244 (settle-time guard for global-CLI-shadowing-branch-build) shipped this session** on the `feat/kernel-assurance-v2` arc — closes `rec-20260729-001`. Built in an isolated worktree (`kernel-arc-work`, now removed), DRAFT→BUILD (3 tasks, each independently reviewed by a fresh Opus subagent with real findings and fixes)→whole-branch review→SETTLE→PR #348, MERGED (`bff35bf4` on `origin/feat/kernel-assurance-v2`). All 3 ACs `pass`, evidence `executed` (verified from the actual `SUMMARY.json`, not asserted from memory) — including a live confirmation that `foreignBinaryMismatch` is correctly *absent* when the phase settled itself via its own local build.
- **A real, user-caught finding this session: the entire kernel-assurance-v2 arc had been settling under `mock` verification on all 7 gate-provider seams since inception** — the user asked "isn't this all mock?" mid-session and was right. Activated the one seam that's actually wired for real verification today (`perTaskVerifier` → `host-cli` with `CADENCE_HOST_CLI_BIN=codex` in the worktree's `.env`, live-smoke-tested), and filed `rec-20260801-003` to track wiring the other 6 (deep-verify, code-review, plan-review, security-audit, spec-review, ui-spec-review — `host-cli` builders don't exist yet for those; `anthropic` would need a paid API key not available in this environment).
- **Also caught and fixed post-merge**: phase 244's settle commit missed promoting `rec-20260729-001` to `shipped` (this repo's single-commit-settle convention says that belongs in the settle commit itself). Fixed via a tiny follow-up PR #349, also merged (`d7aeaef6`).
- **This checkout (`main`) itself was never touched by this session's own work** — no commits made here, no files edited here. Everything happened on the arc branch, in worktrees that are now removed.
- No blockers on the phase-244/arc side. See gotchas below for two things worth knowing before the next session touches this repo.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 3 ahead / 0 behind origin
- HEAD `f1ebd016`
- Recent commits:
```
f1ebd016 chore(cadence): stamp session handoff — kernel-arc-merge-decision-review-recs-filed
e6a2d1d6 chore(cadence): stamp session handoff — kernel-arc-phase242-merged-pr346
fef5b224 chore(cadence): stamp session handoff — phase243-mock-banner-shipped-recs-filed
90887434 chore(cadence): session handoff stamp + CLAUDE.md model-selection docs (#345)
db225ace fix: loud banner on every seam's credential-missing downgrade (phase 243) (#344)
c29bd4ec chore(cadence): session handoff -- v1.52.0 released, rec-20260731-001 filed (#343)
c56532d9 chore(cadence): file rec-20260731-001 (release-currency doctor check) (#342)
9da0ab58 chore(release): v1.52.0 -- Node >=22 engine floor, phase-qualified AC coverage, doctor multi-seam readiness (#341)
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

**Investigation and setup:**
- Resumed via `cadence resume` on the primary checkout; the freshest handoff flagged a live concurrent session (pid 93692) on this exact checkout. Confirmed it was still running, so left `main`'s uncommitted `.cadence/intelligence/*` dirt untouched entirely per that handoff's explicit instruction. User chose to continue kernel-arc work in a new worktree instead of waiting.
- Phase 237 (invariant promotion) is correctly gated/blocked — needs routed-finding evidence that doesn't exist yet (phase 242's routing feature got zero live dogfood in its own settle). Consulted the advisor before committing to a target; it confirmed `rec-20260729-001` (arc phases don't dogfood their own assurance machinery at settle) as the on-mission target over higher-ranked-but-off-mission `cadence recommend` items, and flagged that a schemaVersion sweep would likely narrow the rec's scope — it did: 233/234 are `schemaVersion: 1` (the bug), but 235/236/241/242 are already `schemaVersion: 2` (the arc self-corrected via convention since phase 235), so this became a guard/enforcement phase, not a fresh bugfix.
- User asked whether the verifier config was actually mock arc-wide — it was, on all 7 gate-provider seams, confirmed at `origin/feat/kernel-assurance-v2` HEAD (`7ddc72a1`). `host-cli` is only wired for one seam (`perTaskVerifier`); activated that one with `CADENCE_HOST_CLI_BIN=codex` (deliberately unguarded against the Claude-Code self-invocation recursion guard — verified `CLAUDECODE=1` is set in this shell, confirmed `codex exec` responds correctly live). Filed `rec-20260801-003` for wiring the other 6 seams.

**Phase 244 build** (full detail in the phase's own DRAFT/SUMMARY, now on the merged commit history — `git show bff35bf4` or PR #348):
- T1: pure `detectForeignCadenceBinary` detector + `isPathInside` helper in `settle.ts`, 7 unit tests. Independent review found a real coverage-attribution bug (a literal `AC-1` token in the test file's header comment was shadowing the real asserting tests under the coverage scanner's first-occurrence-wins dedup) — fixed.
- T2: wired the detector into `settleService` (`resolveSettleGateSet`, `writeRefusedSettleSummary`, `finalizeAndCloseSettle`), new `buildForeignBinaryBanner` in `verifier-factory.ts`, new optional `foreignBinaryMismatch` field on `SummaryZ`. Independent review verdict READY, with two non-blocking recommendations both applied (an `argv1` parameter for real testability, a stale doc-comment fix).
- T3: docs (`docs/concepts.md`) + changeset + full pipeline verification. Independent review clean.
- Same AC-token coverage bug found in T2's test file too (worse — no qualifying ref at all for AC-2/AC-3) — fixed in the same pass.
- Whole-branch review (fresh Opus, no prior context) found a real gap the per-task reviews missed: a symlinked repo path could produce a false-positive mismatch report, since the binary path was realpath-resolved but the repo toplevel wasn't. Fixed (`resolveForeignBinaryFacts` now best-effort realpaths both before comparing). Also caught that the newly-filed `rec-20260801-002` (superseded by `rec-20260801-003`) overclaimed "activated" when `per-task-verify` isn't actually in `profile: auto`'s resolved gate set — corrected before it became a durable ledger record.
- Settled via `node packages/core/bin/cadence.cjs settle run --auto` (never bare `cadence` — the whole point of the phase). All 3 ACs `pass`/`executed`.

**Post-merge:** caught that the settle commit missed promoting `rec-20260729-001` to `shipped` (this repo's convention says that belongs in the settle commit itself). Fixed via a second tiny worktree + PR #349 (also merged, `d7aeaef6`).

## Carry-forward gotchas

- **A real, session-observed harness bug: raw `cd` in the Bash tool did not reliably persist across separate tool invocations this session**, despite the tool's own documentation saying cwd persists between commands. Twice this session a fresh Bash call's `pwd` reported the *primary checkout* even though the immediately-preceding call had explicitly `cd`'d into a worktree and printed the correct path. Once nearly caused a wrong-checkout `pnpm build` (caught before anything state-mutating ran). Workaround used for the rest of the session: always `cd <target> &&` at the start of every single compound command that needs a specific directory, or use `git -C <absolute-path>` — never trust cwd carried over from a prior tool call. Worth an actual investigation if it recurs; this handoff can't tell you the root cause, only that it happened and how to work around it.
- **`gh pr merge --delete-branch` on this repo reliably leaves the worktree's local branch deleted and the worktree checked out onto a stray pre-existing local `feat/kernel-assurance-v2` ref (stale, `5d5ec8b6`, well behind origin)** instead of a clean detached/gone state — hit twice this session (phases 242's handoff already documented this once). Harmless — that stale local branch is dangling, not live work — but don't mistake it for something real if you see a worktree mysteriously on `feat/kernel-assurance-v2` at `5d5ec8b6` after a merge.
- **Two more instances of the glob-vs-literal `files:` token bug were found and fixed live** (T1's test file, T3's changeset file) on top of the two already known from phase 242 — `packages/core/src/checks/boundary.ts`'s files-outside-boundary check does exact literal-string `Set` matching, no glob expansion anywhere in this codebase. If you write a DRAFT task's `files:` line with a `*` wildcard expecting glob semantics, it will never match and settle will fire a (non-blocking, `boundaryEnforcement: warn`) anomaly. Worth its own rec if it keeps recurring — it has now bitten 4 separate tasks across 2 phases.
- **The arc's rec/dec-id namespace divergence from `main` continues to grow** — this session minted `dec-20260801-001`, `rec-20260801-002` (archived, superseded), and `rec-20260801-003` on the arc's ledger. Still deliberately deferred per prior handoffs; needs a real diff-and-reconcile pass whenever the arc next syncs with `main`, not a blanket copy.
- **This primary checkout (`main`) is dirty with just `.claude/scheduled_tasks.lock` deleted** — pre-existing from the concurrent session (pid 93692) that was active at session start and has since ended. Not this session's doing; verify it's still stale/abandoned before touching it, per this repo's own concurrent-session caution.
- **`main` is 3 commits ahead of a stale local ref this session never pushed or created** (`f1ebd016`, `e6a2d1d6`, `fef5b224` — all pre-existing handoff-stamp chores from other sessions, confirmed via `git log`). Not this session's work; just noting it predates this handoff so the next session doesn't misattribute it.

## Next action

No specific next action is required — phase 244 and its follow-ups are fully landed and clean. If continuing kernel-arc work: `rec-20260801-003` (wire `host-cli` into the remaining 6 verifier families) is the natural next candidate, `needs-decision` readiness (pick which families to prioritize — deep-verify and code-review are the higher-leverage targets since they're actually in `profile: auto`'s gate set, unlike `per-task-verify`). Otherwise, `cadence recommend` on a fresh arc-branch worktree for the ranked list.
