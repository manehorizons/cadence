---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
---

`cadence resume` now defaults to brief output when live state matches the
handoff doc, and auto-promotes to full output (whole doc + live-context replay)
on drift. New `--full` / `--brief` flags force a mode; `--json` gains a `mode`
field and `context` is now nullable (null in brief mode, since the live-context
recompute is skipped).
