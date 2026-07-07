---
name: pr-land
description: Land a branch through cadence's protected-main pipeline — local preflight, commit hygiene, push, PR, ci-success babysitting with the known-flake protocol, consent-gated squash merge, and post-merge sync. Use when work is ready to land, the user says "land this", "open a PR", "merge when green", or a PR is sitting on CI.
---

# PR land (protected main)

`main` requires the `ci-success` check and `enforce_admins` is on — there is
no direct-push path, for anyone. Everything lands branch → PR → green →
squash merge.

## 1 — Preflight locally (cheaper than a CI round-trip)

- Run `pnpm turbo run lint typecheck test build` before pushing.
- Windows caveat: Linux CI is canonical. A few Windows-local test failures
  are known environment issues (pnpm/tempRepo/spawn races) — if something
  fails only locally and the failure smells environmental, push and let the
  CI matrix decide rather than debugging the dev box.

## 2 — Commit hygiene

- Stage explicitly, never `git add -A`. Off-limits: live `.cadence/state.json`
  + `STATE.md` dirt mid-loop (the settle commit owns those), `.agents/`,
  `launch/` (local-only by explicit decision), `.claude/scheduled_tasks.lock`,
  stray uncommitted `SESSION-*.md` handoffs.
- Two-commit settle convention when a phase is closing: feature commit, then
  `chore: settle`.
- Feature PRs carry their `.changeset/*.md`. Conventional-commit subject with
  the phase id: `feat: <what> (phase NNN)`.

## 3 — Push + PR

```bash
git push -u origin <branch>
gh pr create --title "<subject>" --body "<what/why, invariants checked>"
```

One logical change per PR. The PR body ends with the standard
`🤖 Generated with [Claude Code](https://claude.com/claude-code)` footer.

## 4 — Babysit CI (the flake protocol)

- Watch with `gh pr checks <n> --watch` (or poll `gh pr checks <n>`).
- On red, get the failing leg + test before reacting:
  `gh run view <run-id> --log-failed | head -100`.
- **Re-run once, without investigation, only when all three hold:** a single
  OS/Node leg is red, the diff can't plausibly touch the failing area, and
  the failure matches a known flake (reference: macOS/Node22 timeout in
  `settle-codereview-convergence.test.ts`; new `node --test` subprocess
  spawns under parallel load have flaked before).
- Anything else — multiple legs, plausible relation to the diff, an
  unfamiliar failure, or a second red after the re-run — is real until
  proven otherwise: investigate, don't loop re-runs.

## 5 — Merge (consent-gated)

- Self-merging a PR this session opened requires the operator's explicit
  authorization — "merge it", "merge when green", or equivalent. A generic
  "continue" is not consent; when in doubt, report green and ask.
- With consent: `gh pr merge <n> --squash --delete-branch`.

## 6 — Post-merge sync

```bash
git checkout main && git pull origin main
git log --oneline -3        # confirm the squash landed as expected
```

- Delete the local branch if `--delete-branch` didn't; remove the phase
  worktree if one is now merged and idle.
- `cadence progress` to confirm loop state, and update/write the handoff if
  this landing closes the session's unit of work.
