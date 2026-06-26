---
"@manehorizons/cadence-core": minor
"@manehorizons/cadence-types": minor
"@manehorizons/cadence-host-claude-code": minor
"@manehorizons/cadence-host-codex": minor
---

Add `cadence doctor --fix`: apply safe, deterministic repairs for the fixable
doctor findings (git-hooks → `core.hooksPath=.githooks`; regenerate a missing
`STATE.md`), with a `--wire-host` opt-in that re-runs the Claude Code host
install for host findings and a `--dry-run` preview that writes nothing. Risky
findings stay manual guidance. Non-interactive and agent/non-TTY-safe.
