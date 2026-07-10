---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Harden handoff/resume against two gaps ground-truth discovery didn't cover:
a handoff that's stale relative to origin, and a handoff whose narrative was
never finished.

- `cadence resume` now runs a best-effort origin-freshness probe before
  replaying a doc (config `resume.remoteCheck`, default `true`; `--offline`
  to skip) and warns when origin has commits this clone lacks, since a
  stale handoff can be superseded by work pushed from another machine.
- `cadence resume` and `cadence handoff --check` (new) both detect
  scaffolded `<!-- … FILL IN … -->` sections left unfilled by a prior
  session and flag them — `resume` as a warning, `handoff --check` as an
  exit-3 completion gate.
- `cadence handoff --no-fetch` skips the pre-facts `git fetch` for a fully
  offline write; `git-facts` records whether the fetch actually ran.
- The Claude Code `/cadence-handoff` and `/cadence-resume` slash-command
  guidance text is updated to teach agents the new gate and banner.
