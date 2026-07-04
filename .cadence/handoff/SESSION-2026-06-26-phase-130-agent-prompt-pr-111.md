---
cadence_handoff: 1
generated_at: 2026-06-26T00:50:14.374Z
label: phase-130-agent-prompt-pr-111
loop_position: IDLE
active_phase: 130
active_draft: 
tier: 
git_branch: feat/agent-prompt-first-phase
git_dirty: true
git_head: 6375a99
git_ahead: 0
git_behind: 0
context_packet: .cadence/intelligence/context/handoff.json
---

# Session Handoff — 2026-06-26 (phase-130-agent-prompt-pr-111)

## TL;DR for the next session
- Phase 130 ("First real phase agent prompt", rec-20260619-006) is built, settled (AC-1..AC-5 PASS), and shipped as **PR #111** on branch `feat/agent-prompt-first-phase` (8 commits, 1832/1832 core tests green).
- **Single next action:** watch CI on PR #111 (https://github.com/manehorizons/cadence/pull/111); merge (squash) once the required `ci-success` check is green.
- After merge: cut the **v1.33 release** — the changeset is already in the branch; version bump + npm publish happen via the manual `Release` workflow.
- No blockers. `main` is at **v1.32.0** (`0a53646`); this clone began the session 2 commits behind on a stale handoff and was fast-forwarded.
- Praxis reconciled: recs 001/002/007 → `shipped` (v1.31/v1.32), rec-006 converted→settled, milestone `mil-rec-rec-20260619-006` exported. Remaining backlog is all raw-idea: rec-004 (`doctor --fix`), rec-005 (`init --dry-run`), rec-008 (team rollout kit).

## State on handoff   ·  pre-filled — verify, don't retype
- Branch `feat/agent-prompt-first-phase` (dirty), 0 ahead / 0 behind origin
- HEAD `6375a99`
- Recent commits:
```
6375a99 chore: settle phase 130 (agent-prompt) + praxis reconciliation
cbe14c8 docs(agent-prompt): align Usage block with --help + note --json goal null (review fixes)
b8f0e3d chore(agent-prompt): changeset for the first-real-phase agent prompt
b745c51 docs(agent-prompt): document cadence agent-prompt + init block (AC-5)
a754b64 feat(agent-prompt): list agent-prompt in the quickstart command map (AC-5)
159bc2f feat(agent-prompt): init prints the hand-it-to-your-agent block (AC-3)
afec7d9 feat(agent-prompt): cadence agent-prompt command (AC-2)
3998737 feat(agent-prompt): pure renderAgentPrompt renderer (AC-1, AC-4)
```
- Uncommitted (diff --stat):
```
.cadence/STATE.md   | 2 +-
 .cadence/state.json | 2 +-
 2 files changed, 2 insertions(+), 2 deletions(-)
```
- Loop: IDLE · phase 130 · tier (none)

## CADENCE context   ·  pre-filled from `cadence context handoff`
- Top recommendations:
  - rec-20260619-004 — doctor --fix for safe onboarding repairs (candidate/raw-idea)
  - rec-20260619-005 — init dry-run fit check (candidate/raw-idea)
  - rec-20260619-008 — Team rollout kit (candidate/raw-idea)
- Open assumptions:
  - (none)
- Active decisions:
  - (none)
- Files in play:
  - `packages/core/src/cli/commands/doctor.ts` — affected by rec-20260619-004 doctor --fix for safe onboarding repairs
  - `packages/core/src/doctor` — affected by rec-20260619-004 doctor --fix for safe onboarding repairs
  - `packages/core/src/cli/commands/init.ts` — affected by rec-20260619-005 init dry-run fit check
  - `docs/quickstart.md` — affected by rec-20260619-005 init dry-run fit check
  - `README.md` — affected by rec-20260619-008 Team rollout kit
  - `docs/README.md` — affected by rec-20260619-008 Team rollout kit
  - `.github` — affected by rec-20260619-008 Team rollout kit

## What landed this session
- Resumed from a stale handoff; fast-forwarded the clone from v1.31 (`ab542eb`) to **v1.32.0** (`0a53646`), discarding superseded local `.cadence` telemetry and deleting 6 stale untracked files.
- Reconciled Praxis: recs 001/002/007 → `shipped`; proposed → accepted → exported milestone `mil-rec-rec-20260619-006` (rec-006).
- Brainstormed → spec → 6-task TDD plan for `cadence agent-prompt` (design + plan in gitignored `docs/superpowers/`).
- Built **phase 130** subagent-driven: one implementer + a spec/quality reviewer per task, plus a final opus whole-branch review (caught a `commands.md`/`--help` drift, fixed in `cbe14c8`).
- New surface: `cadence agent-prompt [--goal] [--json]` + a "Hand it to your AI agent" block in `cadence init`, both rendering one pure `renderAgentPrompt` (`packages/core/src/agent-prompt/render.ts`).
- Settled phase 130 (two-commit convention), pushed the branch, opened PR #111.

## Carry-forward gotchas
- This SESSION doc + the `lastHandoff` stamp + the `STATE.md`/`state.json` telemetry are intentionally **uncommitted** — don't sweep them into a commit. There is no feature WIP; all phase-130 work is committed and in PR #111.
- `docs/superpowers/` and `.superpowers/` are **gitignored scratch** (the design doc, the plan, and the SDD ledger/briefs/reports). The durable design record is the phase-130 DRAFT/SUMMARY + PR #111 — not those files.
- PR #111 must land via the required `ci-success` check — `main` is **admin-enforced branch-protected**, so no direct pushes; a flaky OS leg can block the merge until re-run.
- The settle commit `6375a99` bundled the Praxis reconciliation (recs shipped + milestone export) alongside the phase-130 loop artifacts — both ride in this PR.
- **v1.33 is NOT released yet** — only the changeset is in the branch. Version bump + tag + npm publish happen via the manual `Release` workflow *after* merge.

## Next action
**Action:** Watch CI on PR #111 (`gh pr checks 111`, or the GitHub PR page). Once the required `ci-success` check is green, merge (squash) to `main`.

**Verify:** `gh pr view 111 --json state,mergeStateStatus` shows the PR mergeable/clean; after merge, `git checkout main && git pull` shows the squash commit at the tip.

**If it fails:** Re-run any flaky OS leg from the Actions tab. For a real failure, `gh pr checks 111` names the failing job — reproduce locally with `pnpm --filter @manehorizons/cadence-core build lint typecheck test`. After the PR merges, proceed to the **v1.33 release**: `pnpm changeset version` (consumes the in-branch changeset → lockstep `1.32.0 → 1.33.0`), update the `CLAUDE.md` version narrative, then fire the manual `Release` workflow for npm publish + tag.
