---
cadence_handoff: 1
generated_at: 2026-07-02T03:38:00.368Z
label: wave2-phase139-shipped
loop_position: IDLE
active_phase: 139-default-install-enforces-what-the-tutorial-demonstrates
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 595a3f9
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-02 (wave2-phase139-shipped)

## TL;DR for the next session
- Resumed from the prior handoff (wave-1 shipped, v1.36.0); this session finished landing wave 1's remaining steps (merged PR #117, released v1.36.0 to npm via the operator-triggered `Release` workflow) then started **wave 2** of the 2026-07-01 audit — the "enforcement wedge" (recs 001, 003, 009).
- User picked sequencing **001 → 003 → 009**. **rec-20260701-001 is fully shipped to `main`** as phase 139 (PR #119, squash `595a3f9`): `coverageMode` defaults to `'assertion'` for new inits (all presets), `testCommand` auto-derived from `package.json` + detected package manager, and `build-test-must-pass` now warns loudly instead of passing silently when no `testCommand` is configured.
- Single next action: **rec-20260701-003 (SUMMARY gate provenance)** is next in sequence — needs a fresh brainstorming session (design not started yet). User explicitly paused before that to run this handoff.
- No blockers. Loop is IDLE, `main` is clean, phase 139's rec is `converted`→settled in the ledger.
- **npm was NOT re-published this session for phase 139** — it's merged to `main` but not yet in a version bump / release PR. Whether to cut a v1.37.0 for wave-2-phase-1 alone, or bundle with 003/009 later, is an open decision (wave 1's convention was to bundle all sub-phases of a wave into one release; wave 2's phases are more independent/riskier per the audit's own framing, so bundling isn't a foregone conclusion this time).
- Design doc for phase 139 lives at `docs/superpowers/specs/2026-07-02-default-enforcement-design.md` (local only — `docs/superpowers/` is gitignored in this repo, matching every prior brainstormed-design precedent).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `595a3f9`
- Recent commits:
```
595a3f9 feat: default install enforces what the tutorial demonstrates (phase 139) (#119)
9219ecf chore(release): v1.36.0 — onboarding-honesty wave 1 (#118)
963f222 Onboarding-honesty wave 1: 6 audit fixes (doctor, progress, init, README, refusal trio, docs) (#117)
8ed57dc chore(release): v1.35.0 — init-dry-run (#116)
040e5ae feat: cadence init --dry-run fit check (phase 132) (#115)
6a4899d chore(release): v1.34.0 — doctor-fix (#114)
e8101b8 feat(doctor): cadence doctor --fix for safe onboarding repairs (phase 131) (#113)
fbd456b chore(release): v1.33.0 — agent-prompt
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- Loop: IDLE · phase 139-default-install-enforces-what-the-tutorial-demonstrates · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260701-003 — SUMMARY gate provenance: record what ran, what skipped, and what PASS meant (candidate/needs-decision)
  - rec-20260701-008 — Structured draft editing: draft add-ac / add-task / set-objective (candidate/needs-decision)
  - rec-20260701-009 — Sealed gates: let production preset make named gates non-bypassable (candidate/needs-decision)
  - rec-20260701-010 — MCP parity for the intelligence lifecycle (candidate/needs-decision)
  - rec-20260701-012 — Boundary enforcement block mode, including subagent edits (candidate/needs-decision)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `packages/core/src/settle/summary-writer.ts` — affected by rec-20260701-003 SUMMARY gate provenance: record what ran, what skipped, and what PASS meant
  - `packages/core/src/gates/deep-verify.ts` — affected by rec-20260701-003 SUMMARY gate provenance: record what ran, what skipped, and what PASS meant
  - `packages/core/src/parse/draft-scaffold.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/parse/draft-md.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/cli/commands/draft.ts` — affected by rec-20260701-008 Structured draft editing: draft add-ac / add-task / set-objective
  - `packages/core/src/gates/types.ts` — affected by rec-20260701-009 Sealed gates: let production preset make named gates non-bypassable
  - `packages/types/src/config.ts` — affected by rec-20260701-009 Sealed gates: let production preset make named gates non-bypassable
  - `packages/core/src/mcp/tools.ts` — affected by rec-20260701-010 MCP parity for the intelligence lifecycle
  - `packages/core/src/hooks/checks/boundary.ts` — affected by rec-20260701-012 Boundary enforcement block mode, including subagent edits
  - `packages/core/src/hooks/handlers.ts` — affected by rec-20260701-012 Boundary enforcement block mode, including subagent edits
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Confirmed PR #117 (wave-1 onboarding-honesty, 6 phases) CI green and merged (squash `963f222`).
- Cut the v1.36.0 release: changeset, lockstep version bump across all 4 published packages, CLAUDE.md doc-sync narrative, PR #118 merged (squash `9219ecf`). User explicitly authorized triggering the `Release` GitHub Actions workflow this session (normally operator-only) — it ran clean (no propagation flake this time), all 4 packages verified live on npm at 1.36.0, tag `v1.36.0` + GitHub Release confirmed.
- Started wave 2 of the 2026-07-01 audit ("enforcement wedge": recs 001/003/009). User chose sequencing 001→003→009 via `AskUserQuestion`.
- Ran a full `superpowers:brainstorming` session for rec-20260701-001 — grounded in real code (`gates/types.ts`, `gates/build-test-must-pass.ts`, `packages/types/src/config.ts`, `init/plan.ts`), surfaced 3 real gray-area decisions with the user (preset scope for the coverage default, package-manager detection strategy, warn-vs-refuse on missing testCommand), wrote a design spec, got approval, then scaffolded phase 139 via `cadence draft new --from-rec rec-20260701-001`.
- Built phase 139 TDD (5 tasks, T1–T5, each RED→GREEN): coverage-mode default flip, `detectTestCommand` pure helper (lockfile-detected package manager), wiring into `InitPlan`/`init --dry-run`/real init write path, the new `NO_TEST_COMMAND_NOTICE` constant + gate wiring, and docs.
- **Significant unplanned fallout-fixing**: `testkit`'s `tempRepo({initialized:true})` writes `defaultConfig` verbatim, so the `coverageMode` default flip broke ~25 pre-existing CLI tests across 7 unrelated gate-test files (code-review, security-audit, interactive, deep-verify, gate-extraction) whose comment-only coverage-seed helpers (`// covers AC-1`) relied on lenient mention-mode. Fixed at the root — rewrote each shared seed helper to emit a real asserting `it()`/`test()` block; updated 2 snapshot anchors in `settle-gate-extraction.test.ts` for the new notice line + assertion-mode wording. CADENCE's own `files-outside-boundary` anomaly correctly flagged these as undeclared touches at settle time (warn-only, didn't block) — a nice live confirmation the boundary-check machinery works as designed.
- Settled phase 139 (`cadence settle run --auto`, AC-1..AC-5 derived PASS), pushed `feat/139-default-install-enforcement`, opened PR #119, watched CI to green, merged (squash `595a3f9`). `rec-20260701-001` converted → settled in the ledger.

## Carry-forward gotchas
- **`cadence-types` and `cadence-core` need rebuilding before cross-package test runs** — `packages/core/tests/*` resolves `@manehorizons/cadence-types` via its built `dist/`, not `src/`. Editing `packages/types/src/*.ts` and immediately running core's test suite silently tests against the *old* compiled types until `pnpm --filter @manehorizons/cadence-types build` runs. This bit me twice this session (config-edit fields test, build-test-must-pass gate test both showed stale-looking failures until rebuild). Companion to the existing memory note that core's own CLI tests spawn `dist/cli/index.js` and need `core` rebuilt too.
- **Mid-session `git reset --hard origin/main` wiped uncommitted `.cadence/state.json`/`STATE.md` loop-position state** (BUILD → reverted to stale IDLE) when I used it to back out of an accidental direct-commit-to-`main` mistake. Untracked phase artifacts (DRAFT.md, PROGRESS.json) survived fine since `reset --hard` only touches tracked files — I re-ran `draft approve --no-approve` and `recommendation convert` to cleanly restore state rather than hand-editing JSON. **Lesson**: before any `reset --hard` on `main`, check whether `.cadence/state.json`/`STATE.md` carry loop-position changes you'd lose — they're tracked files and will revert silently.
- **Ledger evidence file paths can go stale** — rec-20260701-003's ledger entry still says `packages/core/src/settle/summary-writer.ts`; the real path is `packages/core/src/parse/summary-writer.ts`. Verify file paths against the actual tree before trusting rec evidence, same caution as always applies to memory.
- The 5 stray untracked `SESSION-*.md` handoff docs (dating back to 06-26) are *still* sitting in `.cadence/handoff/` uncleaned across many sessions now — genuinely worth a deliberate pass at some point, not addressed again this session.
- `.claude/scheduled_tasks.lock` continues to show as locally modified across sessions (a live session-lock artifact, harmless, pre-existing drift unrelated to any of this work).

## Next action
**Action:** Run a `superpowers:brainstorming` session for **rec-20260701-003** (SUMMARY gate provenance — "record what ran, what skipped, and what PASS meant"). Ground it in the real code first: `packages/types/src/summary.ts` (the `Summary`/`GateBypassZ` schemas — note `gateBypasses` from phase 120 already gives partial provenance, this rec deepens it with a fuller `gates` array + per-AC evidence class), `packages/core/src/parse/summary-writer.ts` (not `settle/summary-writer.ts` — ledger path is stale), `packages/core/src/gates/deep-verify.ts`. Surface the real design decisions with the user before writing a spec (e.g. exact `gates[]` shape, how evidence class — mention/assertion/executed/ai-verified — is derived per AC, whether this touches the SUMMARY.md renderer too or JSON-only).
**Verify:** after design approval, follow phase 139's exact playbook — write+commit the local spec doc, `cadence draft new --from-rec rec-20260701-003` (or `recommendation convert` if drafted by hand first), fill DRAFT.md, approve, TDD each task, watch for the same cross-package rebuild + `defaultConfig`-fallout traps noted above, settle, PR, merge.
**If blocked:** if the user wants to skip straight to rec-009 (sealed gates) instead, or pause wave 2 entirely for a v1.37.0 release covering just phase 139, both are legitimate — check with the user rather than assuming continuation.
