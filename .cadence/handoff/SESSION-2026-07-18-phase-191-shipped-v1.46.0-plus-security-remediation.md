---
cadence_handoff: 1
generated_at: 2026-07-18T12:59:37.080Z
label: phase-191-shipped-v1.46.0-plus-security-remediation
loop_position: IDLE
active_phase: 191
active_draft: 
tier: 
git_branch: main
git_dirty: true
git_head: 883824a
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-07-18 (phase-191-shipped-v1.46.0-plus-security-remediation)

## TL;DR for the next session
- v1.46.0 is live on npm (all 4 packages lockstep) — phase 191's host-cli builders for all 6 verifier gates are shipped and real. `rec-20260709-002`/`rec-20260710-004` promoted to shipped.
- A Dependabot security-remediation branch, PR #235 (`chore/security-vitest-and-transitive-bump`), is open with CI running as of session end. **Do not merge without checking CI status and re-reading the PR body first** — I was told to push it and stop, not merge unattended.
- The operator said they'd review PR #235 in the morning. Single next action: check `gh pr checks 235`, read the PR body's "known residual gap" note (website's `esbuild@0.27.7`, low severity, not blocking), then ask the operator for merge go-ahead.
- A **concurrent session** (or the operator directly) was live-adding recommendations about a real incident in a sibling "deja" repo (`rec-20260718-001..005`, ledger files) while I worked — those are sitting **uncommitted on `main`**, deliberately left there, not mine to land. Don't lose them; don't commit them without checking whose work it is.
- `pnpm-workspace.yaml`'s `overrides:` field and `package.json`'s `"pnpm": {"overrides": {...}}` field are both confirmed **non-functional** in this repo's pnpm 9.12.0 install — don't reach for either again; use `pnpm update <pkg> --recursive` or an explicit direct devDependency instead (see PR #235 body for the full investigation).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `main` (dirty), 0 ahead / 0 behind origin
- HEAD `883824a`
- Recent commits:
```
883824a chore(cadence): mark rec-20260710-004 shipped (retroactive, no dedicated phase) (#233)
58b0007 chore(cadence): mark rec-20260709-002 shipped (#222 / v1.46.0) (#231)
3f8d7f0 chore(release): v1.46.0 -- host-cli builders for all 6 verifier gates, retro rollup, init --full, onboard, doctor-fix handoff-retention, gate-bypass audit fix (#230)
30d485b chore(deps-dev): bump @typescript-eslint/parser from 8.60.1 to 8.64.0 (#229)
99dc501 chore: pin @types/node major-version updates to this repo's Node floor (#224)
22ebea9 chore(deps-dev): bump prettier from 3.8.3 to 3.9.5 (#84)
f18304f chore(deps-dev): bump @typescript-eslint/eslint-plugin (#85)
26f3daf chore(deps-dev): bump turbo from 2.9.16 to 2.10.5 (#82)
```
- Loop: IDLE · phase 191 · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
  - rec-20260709-003 — cadence init --ci: generate + enforce a CI gate workflow for consumer repos (candidate/raw-idea)
  - rec-20260710-001 — Clarify Claude Code auth vs ANTHROPIC_API_KEY confusion in provider docs + fallback warning (candidate/raw-idea)
  - rec-20260711-004 — Cadence-native UI-spec gate between SPEC and DRAFT (when applicable) (candidate/raw-idea)
  - rec-20260712-003 — Retro friction feeds back into Praxis recommendation scoring (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - dec-20260711-001 — Multi-language assertion-coverage: fast diagnose-fix now, shared-lexer engine as a later phase
- Files in play:
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
1. **Phase 191 released as v1.46.0** (PR #230, merged): cut the release the operator's Praxis-sourced phase 191 work had been sitting unreleased for two days. All four published packages bumped lockstep 1.45.0 → 1.46.0. Hit and fixed the same host-package lockstep gap the v1.45.0 cut hit (`host-claude-code`/`host-codex` only got a patch bump from the changesets dependency cascade; manually aligned to 1.46.0, documented in the commit — third time this exact gap has occurred, worth a rec if it recurs again). Fixed a stale `v1.45.0` reference in `DESIGN.md` caught by the mandatory grep sweep. `Release` workflow's `release-integrity` step reported red (npm-CDN propagation race, the known flake) — verified independently (npm/tag/GitHub release all correct) rather than re-running the workflow.
2. **Release loop closed** (PR #231, #233, both merged): `rec-20260709-002` (settle-pending since phase 190 merged) and `rec-20260710-004` (headless-CLI batching/fallback-chain/model-passthrough — investigated and found all three sub-asks already shipped incidentally across phases 165/178/184/191, no new phase needed) both promoted to `shipped`.
3. **Dependabot triage + fix** (PR #235, open, CI running at session end): see TL;DR + PR body for full detail. Corrected an earlier wrong claim I made to the operator (said all 20 alerts were devDependency-only — `hono` is actually a runtime dependency via `@modelcontextprotocol/sdk`). Bumped vitest 2→4 (not just to the minimally-patched 3.x, which didn't cascade-fix vite), fixed two pieces of real Vitest-4 breakage (a `vi.mock()` arrow-function-as-constructor issue in `hook.test.ts`, and `vitest.shared.ts`'s removed `poolOptions.forks` config), fixed `website/`'s astro/typedoc similarly. Full pipeline reverified green after both fixes (328 files / 2828 tests).
4. Recurring `gh pr merge --squash --delete-branch` local-checkout-failure quirk hit twice more (PRs #230, #233) — always because of dirty `.cadence/*` files at merge time. Remote merge always succeeds regardless; the fix is `git stash` (preserving whatever's dirty, checking whose it is first) → `git checkout main && git pull` → `git branch -d <branch>` → `git stash pop` if the dirt should follow you back to main.

## Carry-forward gotchas
- **PR #235 is unmerged and needs a human decision**, not just a green-CI rubber stamp: read its "known residual gap" section (website's `esbuild@0.27.7`) and decide whether that's acceptable to ship as-is or worth one more pass (untried next step: add `esbuild` as `website/`'s own direct dependency, same trick that fixed `vite` in the main workspace).
- **`rec-20260718-001..005` sit uncommitted on `main`** (concurrent session, real incident write-up about a dispatched agent in a sibling "deja" repo committing unsupervised to main — genuinely relevant reading for anyone touching this repo's own dispatch-plan tooling). Verify who owns finishing that thread before touching those files.
- **pnpm overrides don't work here.** Confirmed empirically (not from docs) across `package.json`'s `pnpm.overrides` and `pnpm-workspace.yaml`'s `overrides:`, three syntax variants, full lockfile regens each time — none ever produced an `overrides:` block in the resulting `pnpm-lock.yaml`. If a future Dependabot alert needs forcing past a parent's pin, go straight to `pnpm update <pkg> --recursive` (works if some consumer's range already permits a fix) or an explicit direct devDependency (always works, forces resolution) — don't waste time on overrides again.
- Two-commit settle convention wasn't used for PRs #230/#231/#233/#235 — none of this session's work went through a formal CADENCE phase (release cuts and rec-housekeeping haven't used a dedicated phase since before phase 184; confirmed no phase directory exists for the v1.43–1.46 release cuts). That matches recent precedent, not a process miss.
- `.claude/scheduled_tasks.lock` shows deleted in `git status` since before this session started (pre-existing, per the original gitStatus snapshot) — untouched, not something this session caused or should clean up.
- `packages/core/bin/cadence.cjs` picked up a mode-only diff (644→755, exec bit) from a `pnpm install` somewhere in this session — harmless, left uncommitted, not worth a commit on its own.
- `packages/core/.gitignore` and `website/.gitignore` both picked up an auto-added `.deja/` entry (the `deja` MCP dedup-checker tool's own cache dir) — not mine, left uncommitted.

## Next action
1. `gh pr checks 235` — confirm CI resolved green (re-run once if a single leg is red and matches the known `settle-codereview-convergence` timeout flake; investigate otherwise).
2. Read PR #235's body, decide on the `website/` esbuild residual gap, then get explicit operator go-ahead before `gh pr merge 235 --squash --delete-branch` (expect the same local-checkout-failure quirk noted above — remote merge will still succeed).
3. Post-merge: sync `main`, re-check `gh api repos/manehorizons/cadence/dependabot/alerts` for remaining open alerts (should drop from 20 to ~1, the documented website esbuild gap).
4. Check on the concurrent `rec-20260718-*` ledger dirt on `main` — is that thread finished, does it need its own commit/PR, or is another session still working it?
5. `cadence recommend` again — next-highest-ranked items were `rec-20260619-008` (team rollout kit), `rec-20260709-003` (`cadence init --ci`), `rec-20260710-001` (auth-vs-API-key doc confusion), all tied at 53/100, `candidate`/`raw-idea`.
