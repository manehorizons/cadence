---
cadence_handoff: 1
generated_at: 2026-07-25T17:05:15.624Z
label: phase-220-01-spec-draft-approved
loop_position: BUILD
active_phase: 220-praxis-ledger-unify
active_draft: 220-01
tier: complex
git_branch: worktree-220-praxis-ledger-unify
git_dirty: true
git_head: e05922e8
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-25 (phase-220-01-spec-draft-approved)

## TL;DR for the next session
- An architecture review (`/improve-codebase-architecture`) surfaced 6 deepening candidates across the CLI/services layer, gates/verify, the Praxis intelligence ledger, and the host adapters; published as a dark-mode-capable HTML artifact.
- Landing strategy decided **against an epic branch**: each candidate becomes its own independent phase/slice landing directly to `main` via its own PR, tied together only by a Praxis milestone for tracking. Release-cut timing (already operator-controlled) decouples "lands on `main`" from "becomes publicly visible."
- All 6 candidates recorded as `rec-20260725-002`..`007` (still `candidate` status, in the primary checkout). Only `rec-20260725-002` (Praxis ledger unification) has been worked so far.
- `rec-20260725-002` → milestone `mil-rec-rec-20260725-002` (accepted, exported, real pre-mortem) → phase `220-praxis-ledger-unify`, slice `220-01`. SPEC and DRAFT both authored, **adversarially reviewed by a fresh Opus pass** (found and fixed real design flaws before either was approved — not rubber-stamped), and approved.
- Loop is now **BUILD**, tier `complex`, `profile: standard` (project default `auto` hit the `auto × complex` soft cap; bumped per operator choice for real supervision on a multi-task refactor).
- **Next: run the `phase-build` skill in a fresh session** to execute DRAFT 220-01's 8 tasks.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `worktree-220-praxis-ledger-unify` (dirty), 0 ahead / 0 behind origin
- HEAD `e05922e8`
- Recent commits:
```
e05922e8 fix: cross-check evidence.json in recommendation id-minting (phase 219-recommendation-id-cross-check) (rec-20260724-013) (#302)
7a72d830 fix(release): give post-publish npm verification a patient retry budget (phase 218-release-verify-retry-budget) (rec-20260725-001) (#301)
d7dedf12 chore(release): v1.51.0 -- SETTLE trust-envelope gate, evidence-floor gate, CHANGELOG-currency gate, retro friction scoring (#300)
87b37a15 feat(githooks): extend the doc-sync gate to CHANGELOG.md (phase 217-changelog-currency-gate) (rec-20260724-003) (#299)
3d1f9b52 chore(security): document brace-expansion audit exception + fix orphaned ledger entry (#298)
d80ce817 docs: sync stale GitHub Pages demo + back-fill CHANGELOG.md through v1.50.0 (#297)
621f87fd feat: close the trust envelope, gate the SETTLE capability class in MCP serve (phase 216-settle-capability-gate) (rec-20260724-005) (#296)
df621ef9 docs: audit sessions ledger-diff findings before closing (phase 215-p0-escape-retro-ledger-diff) (rec-20260724-002) (#295)
```
- Uncommitted (diff --stat):
```
.cadence/intelligence/MILESTONES.md        |  1 +
 .cadence/intelligence/RECOMMENDATIONS.md   | 16 +++++++++++
 .cadence/intelligence/evidence.json        |  7 +++++
 .cadence/intelligence/milestones.json      | 34 ++++++++++++++++++++++
 .cadence/intelligence/recommendations.json | 45 ++++++++++++++++++++++++++++--
 5 files changed, 100 insertions(+), 3 deletions(-)
```
- Loop: BUILD · phase 220-praxis-ledger-unify · tier complex

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260725-002 — Deepen the Praxis ledger into one module (accepted/ready-for-milestone)
  - rec-20260724-004 — Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger (candidate/needs-decision)
  - rec-20260724-006 — Signed or tamper-evident SUMMARY attestations (candidate/needs-decision)
  - rec-20260724-007 — Define and document multi-contributor concurrency semantics for .cadence state (candidate/needs-evidence)
  - rec-20260724-012 — pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented (candidate/needs-evidence)
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
  - `packages/core/src/intelligence/store/io.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/store/ids.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/store/recommendations.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/store/assumptions.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/store/decisions.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/store/milestones.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/reconcile.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/audit.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/intelligence/stats.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/cli/commands/recommendation.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/cli/commands/decision.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `packages/core/src/cli/commands/assumption.ts` — affected by rec-20260725-002 Deepen the Praxis ledger into one module
  - `.cadence/ROADMAP.md` — affected by rec-20260724-004 Refresh .cadence/ROADMAP.md or formally deprecate it in favor of milestones plus ledger
  - `packages/types/src/summary.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `packages/core/src/services/settle.ts` — affected by rec-20260724-006 Signed or tamper-evident SUMMARY attestations
  - `docs/team-rollout.md` — affected by rec-20260724-007 Define and document multi-contributor concurrency semantics for .cadence state
  - `package.json` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented
  - `pnpm-workspace.yaml` — affected by rec-20260724-012 pnpm.overrides is non-functional under the pinned pnpm 9.12.0 — package.json location deprecated, pnpm-workspace.yaml location not yet implemented

## What landed this session
- Wrote and published an architecture-review HTML report (6 candidates, ranked Strong/Worth-exploring) with a follow-up dark-mode pass.
- Recorded `rec-20260725-002` through `rec-20260725-007` in the Praxis ledger (primary checkout).
- Decided against an epic-branch strategy after discussion; confirmed each rec lands as its own phase, tied together via a milestone, decoupled from public release timing.
- Promoted `rec-20260725-002`; created, accepted, and exported milestone `mil-rec-rec-20260725-002` with a real operator-style pre-mortem (failure modes, hidden dependencies, out-of-scope).
- Created worktree `220-praxis-ledger-unify` (branch `worktree-220-praxis-ledger-unify`), installed/built, ran `cadence onboard`, replayed the rec/milestone lifecycle into the worktree's own ledger via the CLI (not file-copied).
- Authored SPEC 220-01; an Opus pass resolved 3 open design questions (shared-ledger hook shape, milestone write-mode fix, doc-sync scope); a separate adversarial Opus review then found 2 **blocking** design defects in that first pass (the shared-ledger interface didn't actually fit `applyRecommendationPromotion`/archive-unarchive/the recommendations+evidence paired write) plus 6 more findings; SPEC rewritten to fix all 8; `spec approve` passed clean (no reloop).
- Authored DRAFT 220-01 (6 ACs seeded from the corrected SPEC, 8 real dependency-ordered tasks). Caught and fixed a `--template refactor` flag mistake that had silently overridden the SPEC auto-seed with generic characterization boilerplate (`draftNewService` checks `--template` before checking for an approved SPEC).
- `draft approve` hit the `auto × complex` soft cap (DESIGN.md M2); bumped `profile: standard` in the DRAFT frontmatter per operator choice; approved cleanly. Loop is now BUILD.

## Carry-forward gotchas
- This worktree's `.cadence/intelligence/` only has `rec-20260725-002` and milestone `mil-rec-rec-20260725-002` replayed into it. Recs `003`–`007` exist only in the primary checkout (`/home/thomas/projects/cadence`), uncommitted. Whoever tackles those next needs their own worktree + the same CLI-replay approach — mint them fresh via `recommendation add`/`promote`/`milestone propose`, don't copy the JSON files directly.
- `milestones.json`/`MILESTONES.md` are gitignored-but-previously-tracked ephemeral files (existing repo convention) — they'll keep showing dirty in `git status` and are NOT meant to be committed, even though the real milestone record (`mil-rec-rec-20260725-002`) only lives there. This is itself a live example of the exact milestone-second-class-ledger problem this phase's AC-3/AC-6 fix.
- `recommendations.json`/`RECOMMENDATIONS.md`/`evidence.json` ARE real tracked ledger files (not ephemeral) — stage these into this phase's eventual single settle commit alongside the code changes, or `rec-20260725-002`'s promotion/lifecycle never lands.
- The global `cadence` on PATH is stale (1.49.0) vs. this repo (1.51.0) — every command this session used `node packages/core/bin/cadence.cjs` explicitly; keep doing that inside this worktree.
- `draft new --template <name>` silently overrides the SPEC auto-seed (checked before the SPEC-exists branch in `draftNewService`) — don't pass `--template` when a same-id APPROVED SPEC should seed the DRAFT's Objective/ACs.
- DRAFT 220-01 is `profile: standard` (frontmatter override), not the project default `auto` — expect the standard×complex gate set (code-review + `--deep` verifier baked in at settle) during BUILD/SETTLE, not the leaner auto set.
- Full SPEC content (6 ACs) and DRAFT content (8 tasks with an explicit dependency chain: T1 → {T2,T3,T4} → T5/T6 → T7 → T8) are already on disk — read `.cadence/phases/220-praxis-ledger-unify/220-01-{SPEC,DRAFT}.md` directly rather than re-deriving scope from memory.

## Next action
**Action:** In a fresh session, resume into this worktree (`/home/thomas/projects/cadence/.claude/worktrees/220-praxis-ledger-unify`) and invoke the `phase-build` skill to drive DRAFT 220-01's 8 tasks through BUILD.
**Verify:** `node packages/core/bin/cadence.cjs progress` should show loop position BUILD, phase `220-praxis-ledger-unify`, draft `220-01` before starting any task work.
**If it fails:** if the worktree/session looks like it might already be resuming elsewhere, confirm the prior session is actually dead before reattaching — do not spin up a second worktree against the same phase/draft (CLAUDE.md "The Zombie Session").
