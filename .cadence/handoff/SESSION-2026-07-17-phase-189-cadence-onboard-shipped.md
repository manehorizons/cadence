---
cadence_handoff: 1
generated_at: 2026-07-17T03:02:56.648Z
label: phase-189-cadence-onboard-shipped
loop_position: IDLE
active_phase: 189-cadence-onboard
active_draft: 
tier: 
git_branch: main
git_dirty: false
git_head: 943972c
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-17 (phase-189-cadence-onboard-shipped)

## TL;DR for the next session
- Session started via `/resume`; replayed handoff (phase-188-shipped) needed one clarification resolved first — a leftover "merge it when green" instruction from the prior session turned out to be stale (nothing was open besides dependabot PRs + a stale unrelated PR #148), confirmed with the user and dropped.
- Picked `rec-20260709-005` ("cadence onboard: one-command setup for the 2nd-Nth teammate") from the fresh `cadence recommend` list — user chose it over `cadence doctor --fix` and an auth-docs clarification as the strongest, most concrete raw-idea candidate. Verified no name/scope collision with the existing `cadence start`/`cadence quickstart` commands before building (phase 188 had to redesign around exactly this kind of collision).
- Built subagent-driven in an isolated worktree: 6 tasks across 3 dispatch waves (T1 host-wire extraction solo → T2 onboard command + T3 CONTRIBUTING.md writer in parallel → T4/T5 tests + T6 docs in parallel), each independently reviewed by a fresh adversarial reviewer agent, each re-verified by me directly (full diff read + `pnpm turbo run lint typecheck test build`), then a whole-branch review (verdict: READY TO MERGE, zero Critical/Important findings — 4 minor cleanups applied before commit: a stale doc comment, an incidental chmod, a TOC-ordering nit, the changeset itself).
- Shipped as PR #219 (feature), then PR #220 (mark rec shipped) — both squash-merged with explicit user consent per PR. PR #220 hit a single-leg Windows flake (`tests/hooks/dispatcher.test.ts` FIFO-cap timeout, wholly unrelated to a JSON/MD-only diff) — one re-run cleared it, matching the known-flake protocol.
- Loop is **IDLE**, phase 189 fully settled and shipped, `main` clean and synced (HEAD `943972c`). Next free phase number is **190** (per `cadence doctor` — the stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom range, same pre-existing non-urgent cleanup item noted in prior handoffs).
- Next step is picking the next unit of work — open choice, not decided. Praxis ledger's remaining candidates are all `raw-idea` readiness with no standout (see `## CADENCE context` above) — expect to either promote+convert one manually or run `cadence-scout` for fresh candidates, same as this session did.

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (clean), 0 ahead / 0 behind origin
- HEAD `943972c`
- Recent commits:
```
943972c chore(cadence): mark rec-20260709-005 shipped (#219) (#220)
7c5f4ff feat: cadence onboard command for the 2nd-Nth teammate (phase 189) (#219)
e310405 chore(cadence): mark rec-20260709-001 shipped (#215) (#216)
175e150 chore(cadence): close stale accepted milestones (108/109/110 already shipped) (#214)
749fd2d feat: cadence init --full one-command setup flag (phase 188) (#215)
d1b44ba chore(cadence): mark rec-20260714-003 shipped (#211) (#213)
abb5a03 chore(cadence): stamp session handoff — retro-rollup-phase-186-shipped (#212)
42dc58f fix: gateBypasses records --allow-auto-complex soft-cap overrides (phase 187) (#211)
```
- Loop: IDLE · phase 189-cadence-onboard · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
  - rec-20260709-002 — cadence doctor --fix: auto-remediate mechanical health-check failures (candidate/raw-idea)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260710-004 — Headless-CLI verifier: batching, fallback-chain, and model-passthrough behavior (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- **PR #219** — `cadence onboard`, a one-command per-machine setup for a developer cloning a repo that already has `.cadence/` committed: installs host hooks (reusing `cadence init`'s host-wire logic, now shared via a new `packages/core/src/init/host-wire.ts` module consumed by both `init.ts` and `onboard.ts`), reports project name/gate profile/provider-key readiness (never a raw secret), never touches `.cadence/config.json`/`state.json`, refuses cleanly (exit 2, points at `cadence init`) when there's nothing to onboard onto. `cadence init` now also seeds a managed `CONTRIBUTING.md` block (new `contributing-md-template.ts`, mirroring `claude-md-template.ts`'s merge contract) pointing new contributors at `cadence onboard`. New tests: `onboard.test.ts` (5), `init-contributing.test.ts` (8). Docs: `docs/reference/commands.md` gained a `### onboard` section. Changeset: `.changeset/cadence-onboard-command.md` (minor).
- **PR #220** — marked `rec-20260709-005` shipped, ref `#219`.
- `cadence doctor`'s `recommendation-shipped-drift` check is clean; next free phase number is 190.

## Carry-forward gotchas
- **New this session — Bash tool cwd can silently desync from the intended checkout when switching between a worktree and the primary checkout via manual `cd` inside compound commands.** After `ExitWorktree(action:"keep")`, a later `cd <worktree-path> && ...` sequence (needed to follow the `pr-land` skill's push/PR steps) left the Bash tool's persisted cwd inside the worktree even after later commands *appeared* to `cd` back to the primary checkout — a `git rebase origin/main` intended for primary's `main` branch actually ran against the worktree's branch instead (harmlessly, since the worktree branch was already merged and about to be deleted, but it could have been destructive on a live branch). **Fix/pattern that worked:** after any worktree↔primary boundary crossing, verify with `git -C <explicit-path> branch --show-current` before running anything rebase/reset/checkout-flavored — don't trust a bare `cd` + subsequent bare `git` command to have landed where intended. Prefer `git -C <path> ...` for anything ambiguous rather than relying on persisted shell cwd.
- **`gh pr merge --delete-branch`'s local post-merge checkout step reliably fails in this checkout** when the primary checkout has local commits origin doesn't (a common state — e.g. an unpushed handoff-stamp commit from a prior session) — this is now the 4th+ time this exact pattern has hit. The remote squash-merge always succeeds regardless. Pattern: `gh pr view <n> --json state,mergedAt,mergeCommit` to confirm the real merge status, then reconcile primary's `main` manually: discard any dirty `.cadence/intelligence/*`/`state.json`/`STATE.md` telemetry drift (it's almost always superseded by the freshly-merged origin content), then `git rebase origin/main` — conflicts in `STATE.md`/`state.json` specifically should resolve by taking origin's side (`git checkout --ours`) since those are derived/regenerated files and origin's post-merge version is authoritative.
- Same PR-merge-consent gate applies per PR, not per session — asked separately for PR #219 and PR #220 rather than assuming one "yes" covered both.
- The stale `171-installer-settings-parse-failure-recovery` worktree still claims a wide phantom phase-number range (2-171ish) in `cadence doctor`'s `worktree-phases` check — same non-urgent cleanup item noted in prior handoffs, still unresolved, still not blocking (`cadence doctor` correctly reports the next genuinely free number, 190, despite the warning).

## Next action
**Action:** Pick the next unit of work. Run `cadence recommend` — as of this handoff the ranked list is all `raw-idea` readiness with no standout (top candidates: `rec-20260619-008` Team rollout kit, `rec-20260709-002` `cadence doctor --fix`, `rec-20260709-003` `cadence init --ci`, `rec-20260710-001` auth/API-key docs clarification, `rec-20260710-004` headless-CLI verifier improvements). Either promote+convert one directly (`cadence recommendation promote <id> --status accepted --readiness ready-for-cadence-spec` then `cadence draft new <190-slug> --template <bugfix|feature|refactor> --from-rec <id>`, done **inside** a fresh worktree per the established DRAFT-authoring-order convention), or run `cadence-scout` for a fresh vetted candidate if the raw ideas don't look worth building as-is.
**Verify:** `cadence progress` shows a new active draft/phase once one is chosen and scaffolded.
**If it fails:** if `cadence draft new` collides on a phase number, re-check `cadence doctor` for the current genuinely-free number (190 as of this handoff, but the stale 171-installer worktree's phantom range means always re-verify rather than trusting this number blindly in a future session).
