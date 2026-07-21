---
'@manehorizons/cadence-core': minor
---

Adds `cadence verify phase [phase] [num]` — a state-independent, phase-scoped re-derivation of whether a settled phase's recorded AC coverage still holds against the current working tree, using only the phase's committed `DRAFT.md` and `SUMMARY.json` (no active loop state required). The coverage rescan is scoped to the phase's own declared task files, closing a cross-phase `AC-N` token collision that an unscoped repo-wide scan would otherwise be vulnerable to. `--changed --base <ref>` discovers phases via `git diff` for CI use; the optional `verification.testCommand` re-run reports a separate, suite-wide (not per-AC) pass/fail signal.

Adds `cadence init --ci`, which scaffolds a GitHub Actions workflow calling `cadence verify phase --changed` on every pull request, plus prints (never executes) a `gh api` recipe to make that check required on the default branch. Closes rec-20260709-003.
