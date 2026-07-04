---
cadence_handoff: 1
generated_at: 2026-06-26T04:05:33.857Z
label: phase-131-doctor-fix-pr-pending
loop_position: IDLE
active_phase: 131-doctor-fix-for-safe-onboarding-repairs
active_draft: 
tier: 
git_branch: feat/doctor-fix
git_dirty: true
git_head: db065fb
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-26 (phase-131-doctor-fix-pr-pending)

## TL;DR for the next session
- Phase 131 (`cadence doctor --fix`, rec-20260619-004) is **built + settled** (AC-1..AC-5 PASS) on branch `feat/doctor-fix` — 2 commits (`380598a` feat + `db065fb` settle). Full monorepo gate green (lint/typecheck/test/build), 1853 tests.
- **Single next action:** push `feat/doctor-fix` (it is **local-only, not pushed**) and open a PR to `main`; squash-merge once the required `ci-success` check is green.
- After merge: cut the **v1.34 release** — the changeset (`.changeset/doctor-fix.md`) is already in the branch but NOT consumed; `pnpm changeset version` (→ lockstep `1.33.0 → 1.34.0`) + CLAUDE.md narrative, then the operator fires the manual `Release` workflow.
- `main` is at **v1.33.0** (`fbd456b`), shipped to npm earlier this session (all 4 pkgs, tag `v1.33.0` `09f1972`).
- No blockers. rec-20260619-004 converted → settled (archived). Remaining backlog is raw-idea: rec-005 (`init --dry-run`), rec-008 (team rollout kit).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `feat/doctor-fix` (dirty), 0 ahead / 0 behind origin
- HEAD `db065fb`
- Recent commits:
```
db065fb chore: settle phase 131 (doctor --fix)
380598a feat(doctor): cadence doctor --fix for safe onboarding repairs (phase 131)
fbd456b chore(release): v1.33.0 — agent-prompt
689249b feat: cadence agent-prompt — hand the first real phase to your AI agent (phase 130)
0a53646 chore: release v1.32.0 (#110)
fae3d3e feat(tutorial): rebuild around the catch (refuse→fix→pass) (#109)
ab542eb feat(release): verify GitHub Release integrity (#108)
39d22b6 chore: release v1.31.0
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- Loop: IDLE · phase 131-doctor-fix-for-safe-onboarding-repairs · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-005 — init dry-run fit check (candidate/raw-idea)
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260619-005 init dry-run fit check
  - `docs/quickstart.md` — affected by rec-20260619-005 init dry-run fit check
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Resumed the phase-130 handoff → merged **PR #111** (agent-prompt, `689249b`) → cut + merged the **v1.33.0** release **PR #112** (`fbd456b`) → operator fired the manual `Release` workflow → **v1.33.0 shipped to npm** (all 4 pkgs, tag `v1.33.0` `09f1972`, provenance). Memory ledger updated.
- Brainstormed + spec'd **phase 131 `cadence doctor --fix`** (design at `docs/superpowers/specs/2026-06-26-doctor-fix-design.md`, gitignored scratch), landed as the phase 131 DRAFT, approved → BUILD.
- Built it TDD across T1–T5: a `fixId` tag on `DoctorCheck`; pure `planFixes`; best-effort `applyFixes` auto repairs (git-hooks → `core.hooksPath=.githooks`, missing `STATE.md` regenerated from valid `state.json`); `--wire-host` opt-in with single-spawn dedupe; CLI `--fix`/`--wire-host`/`--dry-run` + `--json {report,fixPlan,fixesApplied,postFixReport}`; commands.md docs. +21 tests.
- Settled phase 131 (AC-1..AC-5 PASS, T1..T5 DONE); rec-20260619-004 converted → settled (archived). v1.34 changeset added to the branch.

## Carry-forward gotchas
- `feat/doctor-fix` is **local-only — NOT pushed**. Push before opening the PR.
- The v1.34 changeset (`.changeset/doctor-fix.md`) is in the branch but **not consumed** — `package.json` is still 1.33.0. The version bump happens at release (`pnpm changeset version`), not now.
- **CLI tests spawn `dist/cli/index.js`** — rebuild core (`pnpm --filter @manehorizons/cadence-core build`) before running CLI-affecting tests, or a regression hides until CI.
- This SESSION doc + the `lastHandoff` stamp + the `STATE.md`/`state.json` telemetry are intentionally **uncommitted** — don't sweep them into a commit. There is no feature WIP; all phase-131 work is committed.
- The phase-130 SESSION doc (`SESSION-2026-06-26-phase-130-agent-prompt-pr-111.md`) is still **untracked scratch** — left intentionally; don't commit it.
- `main` is **admin-enforced branch-protected** — land via PR + a green `ci-success`; a flaky OS leg can block the merge until re-run.
- `docs/superpowers/` is gitignored scratch (the design spec lives there); the durable design record is the phase 131 DRAFT/SUMMARY.

## Next action
**Action:** Push the branch and open the PR: `git push -u origin feat/doctor-fix`, then `gh pr create --base main --head feat/doctor-fix` (title e.g. `feat(doctor): cadence doctor --fix for safe onboarding repairs (phase 131)`). Watch CI (`gh pr checks <#>`); squash-merge once the required `ci-success` is green.

**Verify:** `gh pr view <#> --json state,mergeStateStatus` shows MERGEABLE/CLEAN; after merge, `git checkout main && git pull` shows the squash commit at the tip.

**If it fails:** Re-run any flaky OS leg from the Actions tab. For a real failure, reproduce with `pnpm turbo run lint typecheck test build` (rebuild `dist` first for CLI tests). After the PR merges, cut the **v1.34 release**: `pnpm changeset version` (consumes the in-branch changeset → lockstep `1.33.0 → 1.34.0`), update the `CLAUDE.md` version narrative (doc-sync gate), open the release PR, then the operator fires the manual `Release` workflow for npm publish + tag.
