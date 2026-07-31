---
cadence_handoff: 1
generated_at: 2026-07-27T22:58:02.219Z
label: phase238-shipped-phase0-kernel-next
loop_position: IDLE
active_phase: 229-readme-mermaid-diagram-doc-test
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: c28ae333
git_ahead: 7
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-27 (phase238-shipped-phase0-kernel-next)

## TL;DR for the next session
- Filed and merged three PRs this session: #322 (rec-20260727-012, roadmap-currency doctor check), #323 (rec-20260727-013 + Phase 238's ROADMAP entry), and #324 (Phase 238 itself, fully settled and merged).
- Phase 238 dropped Node 20 support and raised `engines.node` to `>=22` across all five published packages + `host-toolkit`; CI matrix collapsed from Node 20+22 to Node 22 only (verified in real CI: 3 legs, not 6).
- Shipped as a **minor** version bump, not major — explicit operator decision to follow the Zod v3→v4 (`[1.4.0]`) precedent; CADENCE reserves its first major/2.0.0 for when "the full coupling of Cadence is complete" ([[cadence-semver-policy-v2-reserved]] memory).
- This sandbox's nvm default was Node 20.20.2 (below the new floor) for most of the session; the operator has since switched it to 22 directly.
- Loop is IDLE, no active draft; next free phase number is 239.
- **Single next action:** start Phase 0 kernel/assurance work — `rec-20260727-001` + `rec-20260727-002` are Slice 1 (phases 232–233), explicitly "unconditionally valuable standalone" per `.cadence/ROADMAP.md`'s v1.52.0 section, sourced from `docs/handoffs/cadence-phase0-assurance-kernel-review.md`.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 7 ahead / 0 behind origin
- HEAD `c28ae333`
- Recent commits:
```
c28ae333 Merge remote-tracking branch 'origin/main'
127a06b0 chore: drop Node 20 support, raise engine floor to Node >=22 (phase 238) (#324)
0cdfb94a Merge remote-tracking branch 'origin/main'
df41e3ca chore(cadence): file phase 238 (drop Node 20 support) + backfill phase 231's rec id (#323)
31a6c327 Merge remote-tracking branch 'origin/main'
b14ee304 chore(cadence): file phase 231 recommendation (roadmap-currency doctor check) (#322)
47d1ab0b Merge remote-tracking branch 'origin/main'
0281b365 chore(cadence): stamp session handoff — phase0-recs-filed-roadmap-backfilled
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
- PR #322 — filed `rec-20260727-012` (roadmap-currency `cadence doctor` check recommendation).
- PR #323 — filed `rec-20260727-013`, added Phase 238's `.cadence/ROADMAP.md` entry, backfilled Phase 231's rec id in its heading.
- PR #324 — Phase 238 fully settled: 8 tasks, 8 ACs, all PASS. Dropped Node 20 CI leg + `engines.node` floor bump to `>=22`; fixed a real regression the floor bump exposed in `cadence doctor`'s own node-floor check (hardcoded `>=20` messages + six test fixtures assuming Node 20 as "healthy"); dependabot's `@types/node` ignore rule reworded + dependency bumped to `^22.20.1`; doc-prose swept across 8 current-state files (`CLAUDE.md`, `README.md`, `docs/cli.md`, `docs/quickstart.md`, `packages/core/README.md`, `docs/reference/commands.md`, plus two stale test comments) — two whole-branch-review rounds were needed to catch all of it. `rec-20260727-013` promoted to shipped in the settle commit.
- Two memories saved: semver policy (v2.0.0 reserved) and the sandbox Node-22 requirement gotcha.

## Carry-forward gotchas
- **This repo's engines.node floor is now `>=22`.** Any `cadence`/`pnpm` command in this checkout requires Node ≥22 — `cli/index.ts` hard-refuses at startup otherwise. The operator's nvm default is now 22 (confirmed fixed this session), but verify with `node --version` before assuming.
- `gh pr merge --squash --delete-branch` failed its local post-merge checkout step twice this session (known recurring pattern — the primary checkout has `main` checked out). The remote merge always succeeded regardless both times; verify via `gh pr view <n> --json state,mergedAt,mergeCommit`, never re-run the merge command.
- Local `main` still carries one genuinely pre-existing, unpushed, unrelated commit (`b7f26373`, a dumpfile-gitignore chore) that predates this session — flagged repeatedly but never resolved. It's harmless sitting there, but branch off `origin/main` (not local `main`) for new work to avoid sweeping it into an unrelated PR's squash, same pattern hit twice this session.
- `rec-20260719-001` has a pre-existing triplication in `recommendations.json`'s `archived` array (3 entries, different statuses/timestamps) — confirmed present before this session, not introduced by it. Not fixed; worth a ledger-hygiene pass sometime.
- Merging `origin/main` into a checkout with pending local ledger writes can produce a benign field-reordering "conflict" in `recommendations.json` (e.g. `scoutId`'s position on an entry) with zero semantic difference — happened twice this session, resolved by just picking either side. Don't mistake it for real data loss.
- Phase 0's kernel/assurance spec lives at `docs/handoffs/cadence-phase0-assurance-kernel-review.md` — read its slice breakdown (Slice 1 = phases 232–233) before assuming build order across `rec-20260727-001` through `-011`.

## Next action
**Action:** Begin Phase 0 kernel/assurance work, starting with `rec-20260727-001` (Assurance manifest: persist verifier family/model for code-review + security-audit) and `rec-20260727-002` (SUMMARY forward-compat read) — Slice 1, phases 232–233, per `.cadence/ROADMAP.md`'s v1.52.0 section. Set up an isolated worktree (`.claude/worktrees/232-<slug>`), scaffold the DRAFT with `cadence draft new 232-<slug> --from-rec rec-20260727-001 --template feature`, and run it through the same SPEC/DRAFT → BUILD → SETTLE + `phase-build` skill pattern used for phase 238.
**Verify:** `cadence recommendation list` shows `rec-20260727-001` converted to a phase; the resulting phase's SUMMARY shows AC PASS for persisting verifier family/model in `GateProvenanceZ` (`packages/types/src/summary.ts`).
**If it fails:** if Slice 1 feels entangled with the kernel/verifier-boundary work in `rec-20260727-003` (needs-decision, not yet ready-for-cadence-spec in the same way 001/002 are), re-read `docs/handoffs/cadence-phase0-assurance-kernel-review.md`'s slice breakdown before assuming build order — ROADMAP.md's own framing says Slice 1 stands alone, but confirm with the operator if the DRAFT reveals a real dependency.
