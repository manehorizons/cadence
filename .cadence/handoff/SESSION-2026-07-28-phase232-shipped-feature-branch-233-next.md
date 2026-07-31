---
cadence_handoff: 1
generated_at: 2026-07-28T01:01:14.494Z
label: phase232-shipped-feature-branch-233-next
loop_position: IDLE
active_phase: 229-readme-mermaid-diagram-doc-test
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: a0ca4e31
git_ahead: 8
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-28 (phase232-shipped-feature-branch-233-next)

## TL;DR for the next session
- Resumed via `/resume`, started Phase 0's kernel/assurance arc: built and shipped **Phase 232** (`rec-20260727-001` — gate provenance carries verifier identity; SUMMARY schemaVersion 2) end-to-end through the subagent-driven `phase-build` pipeline, landed as PR #327.
- **Mid-session the operator introduced a new standing workflow**: everything in this arc (phases 232 through whatever ships v2.0.0) lands on one long-lived feature branch, **`feat/kernel-assurance-v2`**, via per-slice PR — not directly on `main`. Only the whole arc merges to `main` at the very end. PR #327 had to be retargeted post-hoc (`gh api .../pulls/327 -X PATCH -f base=feat/kernel-assurance-v2`, since `gh pr edit --base` is broken by a `gh` 2.45.0 bug — see gotchas). Saved as memory `cadence-kernel-assurance-feature-branch`.
- PR #327 is merged into `feat/kernel-assurance-v2` (squash), fully green CI (one legitimate Windows-leg re-run for a transient zero-output lint anomaly, confirmed not a real failure).
- **This primary checkout is still on `main`**, unchanged this session (still 8 ahead of origin, pre-existing/unrelated dirt from the prior session's handoff-stamp commits — not touched). `feat/kernel-assurance-v2` only exists as a separate local branch ref + on origin.
- Phase 231 (`rec-20260727-012`, roadmap-currency doctor check) was explicitly deferred in favor of starting Phase 232 first — still unbuilt, not abandoned.
- **Single next action:** build Phase 233 (`rec-20260727-002` — per-settle assurance record), branching off `feat/kernel-assurance-v2` this time (not `origin/main`), same `phase-build` pipeline pattern as Phase 232.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 8 ahead / 0 behind origin
- HEAD `a0ca4e31`
- Recent commits:
```
a0ca4e31 chore(cadence): stamp session handoff — phase238-shipped-phase0-kernel-next
c28ae333 Merge remote-tracking branch 'origin/main'
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
0cdfb94a Merge remote-tracking branch 'origin/main'
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
31a6c327 Merge remote-tracking branch 'origin/main'
b14ee304 chore(cadence): file phase 231 recommendation (roadmap-currency doctor check) (#322)
47d1ab0b Merge remote-tracking branch 'origin/main'
```
- Loop: IDLE · phase 229-readme-mermaid-diagram-doc-test · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260727-001 — Assurance manifest: persist verifier family/model for code-review + security-audit (candidate/ready-for-cadence-spec)
  - rec-20260727-002 — SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome (candidate/ready-for-cadence-spec)
  - rec-20260727-012 — cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift) (candidate/ready-for-cadence-spec)
  - rec-20260727-003 — Kernel/verifier contract + lint rule against internal imports (candidate/ready-for-cadence-spec)
  - rec-20260726-005 — coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode (candidate/needs-decision)
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
- Files in play:
  - `packages/core/src/gates/types.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/types/src/summary.ts` — affected by rec-20260727-001 Assurance manifest: persist verifier family/model for code-review + security-audit
  - `packages/core/src/cli/commands/summary.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `packages/core/src/verify/phase-replay.ts` — affected by rec-20260727-002 SUMMARY forward-compat read: accept schemaVersion 1|2, distinct "newer Cadence" outcome
  - `.cadence/ROADMAP.md` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/checks/roadmap-currency.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/cli/commands/doctor/registry.ts` — affected by rec-20260727-012 cadence doctor check: roadmap-currency (anti-recurrence for ROADMAP/MILESTONES drift)
  - `packages/core/src/gates/engine.ts` — affected by rec-20260727-003 Kernel/verifier contract + lint rule against internal imports
  - `packages/core/src/gates/coverage.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode
  - `packages/core/src/gates/registry.ts` — affected by rec-20260726-005 coverage.ts's coverageBypassed is false-negative when a --force-only bypass overrides real coverage gaps in assertion mode

## What landed this session
- Phase 232 DRAFT authored by hand (structural coherence check passed) in worktree `.claude/worktrees/232-gate-provenance-verifier-identity`, approved, entered BUILD.
- All 6 tasks (T1 schema extension, T2 code-review/security-audit gate wiring, T3 registry provenance merge, T4 settle schemaVersion 2, T5 forward-compat SUMMARY reader, T6 regression fixtures + docs) dispatched to subagents in dependency-respecting waves (`cadence dispatch plan`), each independently re-verified in the main thread (diff review + fresh lint/typecheck/test/build run) before recording DONE — never trusted from a subagent's self-report.
- Whole-branch adversarial review (fresh subagent, zero prior context): **READY TO MERGE**, zero Critical/Important findings.
- `cadence settle run --auto`: all 5 ACs pass with `executed` evidence, `schemaVersion: 2` confirmed in the SUMMARY.
- Single commit (source + tests + docs + phase artifacts + changeset), `rec-20260727-001` promoted to `shipped` in the same commit.
- Created `feat/kernel-assurance-v2` off `origin/main`, retargeted PR #327 onto it, full CI green (`ci-success` pass across ubuntu/macos/windows + build/audit/sbom/secret-scan/CodeQL), squash-merged.
- Worktree `232-gate-provenance-verifier-identity` removed (its content is preserved via the squash merge on `feat/kernel-assurance-v2`, SHA `3b95218b`).

## Carry-forward gotchas
- **New standing workflow for this arc only**: phases 232+ branch off and PR into `feat/kernel-assurance-v2`, not `main` — set the PR base at creation (`gh pr create --base feat/kernel-assurance-v2`), don't retarget after like this session had to. Unrelated phases outside this arc still land on `main` directly as before. Full detail in memory `cadence-kernel-assurance-feature-branch`.
- **`gh pr edit --base` is broken** on the installed `gh 2.45.0` — fails with a GraphQL error querying deprecated Projects Classic (`repository.pullRequest.projectCards`) even though the request has nothing to do with project boards. Workaround: `gh api repos/manehorizons/cadence/pulls/<n> -X PATCH -f base=<branch>` works fine.
- **The primary checkout's `.cadence/intelligence/recommendations.json` will show `rec-20260727-001` as `candidate`, not `shipped`**, until `feat/kernel-assurance-v2` merges to `main` — the promotion to `shipped` landed on the feature branch, not `main`. Don't mistake this for the promotion having failed; check the ledger on `feat/kernel-assurance-v2`, not `main`, while this arc is in flight.
- A Windows CI leg failed `pnpm lint` with **zero diagnostic output** (no eslint error text at all, just `ELIFECYCLE Command failed`) on the first run of PR #327 — re-ran once per the known-flake protocol and it passed clean on retry (lint step included). If this recurs, it looks like a turbo/Windows log-capture issue, not real lint content — verify locally (`pnpm turbo run lint`) before assuming a real regression.
- Phase 231 (`rec-20260727-012`) is still queued, unbuilt — the operator explicitly chose to do 232 first this session; 231 wasn't rejected, just deferred.
- Local `main` is still 8 ahead of `origin/main` — pre-existing, unrelated to this session's work (chore/handoff/merge commits from the prior session), not touched or investigated this session.
- A sibling worktree (`.claude/worktrees/171-installer-settings-parse-failure-recovery`) still has an old, unrelated resumable handoff from phase 166 (2026-07-11) — surfaced by `cadence resume --list` at session start, not touched, likely just stale and worth a cleanup pass sometime.

## Next action
**Action:** Build Phase 233 (`rec-20260727-002` — "Per-settle assurance record", full spec at `.cadence/ROADMAP.md` lines ~1953–1985). Create a fresh worktree off `feat/kernel-assurance-v2` (not `origin/main`): `git fetch origin && git worktree`/`EnterWorktree` from `origin/feat/kernel-assurance-v2`. Scaffold the DRAFT with `cadence draft new 233-<slug> --from-rec rec-20260727-002 --template feature`, hand-author Objective/ACs/Tasks against the ROADMAP's Phase 233 entry (5 ACs already specified there, including the binding tripwire: if AC-3's "no gate-specific special cases" can't be met, stop after 233 and abandon slices 2–4 — record that outcome in the SUMMARY if it happens). Run the same `phase-build` pipeline as Phase 232: coherence check → approve → wave-based subagent dispatch with independent main-thread re-verification per task → whole-branch review → `cadence settle run --auto` → single commit → PR with base `feat/kernel-assurance-v2` set at creation time → babysit CI → merge on explicit consent.
**Verify:** `cadence recommendation list` shows `rec-20260727-002` converted to phase 233; the resulting SUMMARY shows AC PASS for all 5 ACs, particularly AC-3 (no gate-specific special cases in the assurance-record derivation) and AC-2 (an all-`mock` settle and an equivalent real-provider settle produce different assurance records).
**If it fails:** if AC-3's tripwire actually trips (the assurance record can't be expressed without gate-specific special casing), stop per the spec's own binding instruction — do not push through slices 2–4, record the outcome, and flag it to the operator before doing anything else.
